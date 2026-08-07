# AGENTS.md — project context for AI assistants

**Read this before changing anything.** It is the single briefing for any AI tool or fresh chat
working on this repo: what the product is, how it is built, the conventions to follow, and the traps
that have already caused real bugs here. If you are asked to "change X", this file should be enough
context to do it without re-discovering the codebase.

Written for portability — paste it into any chat, or let an agentic tool load it automatically.
`CLAUDE.md` points here so Claude Code picks it up too.

> **No secrets in this file.** Credentials live in `server/.env`, `frontend/.env` and `school*.env`
> (all gitignored). Server IPs, SSH key names and domains are deliberately left out — they are in the
> local deployment guides listed at the end, which are not committed.

---

## 1. What we are building

A **school fee management + ERP system** for small Indian private schools (roughly 500–2000
students), currently branded for **R K Public School**. It started as fee management and has grown
into a light ERP.

Business context that shapes the design:

- The users are **school office staff in a tier‑3 town**, not technical people. Ease of use beats
  feature count. Big buttons, few clicks, plain language.
- **Most parents have no email address.** This single fact drives the auth design (see §5) and it is
  the most common reason a "normal" approach is wrong here.
- **Teachers and parents use this on cheap Android phones.** Their dashboards are mobile-first; the
  admin console is desktop-first.
- The owner intends to **sell this to more schools**. Anything school-specific must be configurable
  by environment variable, never hardcoded.
- Two schools are going live now; the deployment is multi-school on one server (see §10, §11).

---

## 2. Stack and how to run it

Plain **npm per folder**. No monorepo, no pnpm, no workspaces. Two folders.

| | Path | Stack | Run | Port |
|---|---|---|---|---|
| Backend | `server/` | Express 4 + TypeScript (**CommonJS**), Mongoose 8 | `npm run dev` (tsx watch) | 5000 |
| Frontend | `frontend/` | Vite 6 + React 18 + TS + Tailwind 3 + shadcn/ui | `npm run dev` | 5173 |

```bash
cd server   && npm install && npm run dev     # http://localhost:5000
cd frontend && npm install && npm run dev     # http://localhost:5173
```

Checks before you claim anything works:

```bash
cd server   && npx tsc --noEmit    # must be silent
cd frontend && npm run build       # runs tsc --noEmit then vite build
```

Both sides have `strict`, `noUnusedLocals` and `noUnusedParameters` on, so an unused import is a
build failure. Local dev: Node 24, npm 11, Docker 29. Database is MongoDB (Atlas locally).

Other libraries in use: `jsonwebtoken`, `bcryptjs`, `razorpay`, `nodemailer`, `helmet`,
`express-rate-limit` (backend); `axios`, `react-router-dom`, `react-hot-toast`, `recharts`,
`lucide-react`, `qrcode.react`, `tailwind-merge` (frontend).

---

## 3. Repo layout

```
server/src/
  app.ts            express app + all route mounts
  server.ts         boot: connect DB → migrations → seed superadmin → late-fee sweep → listen
  config/           env.ts (ALL process.env reads live here), db.ts, seedSuperAdmin.ts
  models/           21 Mongoose models
  controllers/      one per domain
  routes/           one per domain, mounted in app.ts
  middleware/       auth.ts (protect, authorize), errorHandler.ts, rateLimit.ts
  utils/            shared helpers — read these before writing a new one

frontend/src/
  App.tsx           routes + role guards
  pages/            Home, Login, Register, Forgot/ResetPassword, Receipt,
                    admin/* (19 pages), portal/* (parent), teacher/*
  components/       shared UI + shadcn primitives in components/ui/
  lib/              api.ts (axios), constants.ts, school.ts (branding), csv.ts, pay.ts,
                    roles.ts, utils.ts (cn, formatINR)
  context/          AuthContext

deploy/             backup scripts for the non-Docker boxes
docker-compose.yml  one full stack per school
sample-data/        example CSVs for import
```

API mounts: `/api/{health,auth,admin,students,fees,invoices,payments,reports,portal,config,audit,`
`teachers,teacher,holidays,staff,trash,subjects,exams,backup,access,admissions,timetable}`.

`/api/teachers` is admin-facing teacher management; `/api/teacher` is the logged-in teacher's own
portal. They are different routers — do not confuse them.

---

## 4. Domain model — the concepts you must know

- **Session** = academic year, string `"2026-27"`. `CURRENT_SESSION` is in `server/src/utils/academics.ts`
  **and mirrored** in `frontend/src/lib/constants.ts`. Keep them in sync.
- **Class / Section** — classes are `Nursery, LKG, UKG, 1…12`; sections `A…G`. Defined in
  `frontend/src/lib/constants.ts` (`CLASSES`, `SECTIONS`) and must match the values used in fee
  structures, or invoice generation silently matches nothing.
- **FeeHead** — a named fee (Tuition, Transport, Exam Fee). `optional: true` marks an opt-in service.
- **FeeStructure** — one per (class, session), holding items with amounts. **Exactly one** per
  class+session is enforced; a second one used to cause double billing.
- **Student.optedServices[]** — which optional services this student takes.
  **Student.serviceFees[]** — per-student override amount, stored only when it differs from the class
  amount.
- **Invoice** — one per **(student, period, session)**, where `period` is `"YYYY-MM"`. See §8; this
  rule is load-bearing.
- **Money is plain rupee numbers.** No paise integers, no Decimal128. Razorpay needs paise, so
  multiply by 100 only at the gateway boundary.
- **Receipt numbers** are `RCP-00001`, derived from `countDocuments() + 1` and protected by a unique
  index. Voided payments keep their row so the sequence never has holes — which is also why a payment
  must never be hard-deleted (the next number would collide).
- **Attendance / Holiday** use a `dateKey` string `"YYYY-MM-DD"` (never a Date, to dodge timezone
  drift). Sunday is a weekly off by default; holidays are school-wide. Attendance % =
  `present / (present + absent)` over recorded non-holiday, non-Sunday days; **75%** is the
  green/red threshold.
- **Exams** — one exam per (session, class, name), shared across sections so cross-section ranking is
  fair. Pass mark defaults to **33%**. Weighted overall uses unit 10 / half-yearly 40 / annual 50.
  **Publishing is admin-only** and locks teacher marks; parents only ever see published results.

---

## 5. Roles and authentication — read this carefully

Roles: `superadmin` | `admin` | `teacher` | `parent` | `student`.

- **superadmin** — everything: fee setup, reports, access management, backups.
- **admin** — the fee counter: collect payments, issue receipts.
- **teacher** — own classes only: attendance, marks, own timetable.
- **parent** / **student** — own children only: dues, online payment, receipts, results, timetable.

### Login is by mobile number, and the office issues passwords

Because most parents have no email:

- Login accepts a **10-digit mobile number** or an email, in one `identifier` field.
- **The office creates logins and sets passwords.** In the app: Students → 🔑 on a row, or
  **Give class access** for a whole class at once (printable slips, CSV export, and the choice of a
  random password per family or one shared password). Backend: `/api/access/*`, superadmin only.
- **Forgot password for a phone identifier returns "contact the school office"** with *no database
  lookup* — deliberately, so it cannot be used to discover which numbers are registered.
- Office-set passwords must be **≥ 8 characters** (`access.controller.ts`). The `User` model's own
  floor is 6. Generated passwords avoid look-alike characters (`0/O`, `1/l/I`) because they are
  written on paper slips and read aloud.
- **Email login still works** and email remains optional on `User` and `Teacher`.
- **Siblings share one login** — matching on `parentPhone` is what makes several children appear
  under one parent account.
- **Staff whose own child studies here** keep one login for both roles: role resolves to `teacher`
  and a "My child" tab shows that child's fees.

### How long a session lasts, and how to end one

Session length is **per role**, in `server/src/utils/token.ts`: superadmin `7d`, admin `30d`, teacher
`180d`, parent/student `365d`. A teacher opens the installed app every morning to take attendance, and
cannot reset their own password without the office, so being logged out mid-term is a real cost;
a superadmin can export every record, so that session stays short. `JWT_EXPIRE` in the env files is
**only the fallback** for a role missing from that table — it does not override it.

Year-long sessions are only safe because both off-switches take effect on the next request:

- **Revoke the login** (`/api/access/...`) **deletes the `User`**, and `protect` re-reads the user from
  the database on every request, so the token dies immediately. That lookup is not redundant.
- **Setting a new password stamps `passwordChangedAt`**, and `protect` rejects any token issued before
  it. This is the "log out everywhere" for a lost phone — the office's existing "set a new password"
  button already does it, no separate action.

Two things to leave alone: `passwordChangedAt` is stored **one second in the past** (a JWT's `iat` is
whole seconds rounded down, so a token minted in the same second would otherwise be rejected the moment
it was issued — and password reset returns a token, so that path would break outright); and it is
**not** set for a brand-new account, which has no sessions to invalidate.

### Never write an ownership check by hand

Use the shared helpers. This has caused two real data-leak bugs.

```ts
// server/src/utils/children.ts
childrenFilter(user)      // → the query for "this user's children"
findChildren(user)        // → the students
childStudentIds(user)     // → just their ids
isMyChild(user, id)       // → ownership check for paying / opening a receipt

// server/src/utils/teacherForUser.ts
teacherForUser(req)       // → the Teacher document for the signed-in user
```

---

## 6. What already exists (do not rebuild)

**Fees & money** — fee heads; per-class fee structures; monthly invoice generation with per-class
**and** per-fee checkboxes; Undo a Month; counter collection (cash / cheque / UPI QR); Razorpay
online payment with a convenience fee; concessions; fines; automatic late fees; advance credit;
defaulters; collection reports; branded printable receipts; email reminders.

**Students** — CRUD, single and **bulk add** (grid, per-student services and overrides), CSV/JSON
import & export, session/class/status filters with pagination, detail page, mark-left / rejoin,
**promotion with undo**, admissions enquiries.

**Academics** — subjects master; exams; marks entry (subject-by-subject, auto-save); ranking; admin
publish gate; parent report card; class timetable; exam date sheets; teacher timetable.

**Attendance** — student attendance by class teacher (optimistic tap-to-mark), staff & teacher
attendance, named school-wide holidays, Sunday auto-off, attendance %.

**Ops** — audit log; **recycle bin**; void payment; download backup; restore (merge or replace, with
an automatic pre-restore snapshot); backup to Google Drive via rclone; analytics dashboard;
per-school branding by env var; dashboard access management.

**Reversibility is a locked design principle:** anything an admin can do by mistake must be
undoable *in the app*, never by database surgery. If you add a destructive or bulk action, add its
reversal in the same change. Existing mechanisms: recycle bin (restores with the **same `_id`** so
references survive), void payment, undo promotion, remove concession, unmark attendance, undo fee
generation.

---

## 7. House style

- **Match the surrounding code.** Same comment density, naming and idiom.
- **Comments explain *why*, not *what*.** The codebase is full of comments recording a trap or a
  decision. Keep that up; delete none of them without reason.
- Backend: `asyncHandler` wraps every controller; throw `ApiError(status, message)` for failures;
  `logAudit(req, AUDIT.X, description)` after anything consequential (fire-and-forget).
- **All `process.env` reads go in `server/src/config/env.ts`.** Nowhere else.
- Frontend: `cn()` for class names, `formatINR()` for money, `toast` for feedback, `api` (axios)
  for calls. Mobile tap targets ≥ 44px (`h-11`) with `touch-manipulation`.
- Dialogs that hold a lot of typed input use `onInteractOutside={(e) => e.preventDefault()}` so a
  stray backdrop click cannot discard the work.
- Never surface raw `mongodump` / `mongorestore` stderr to a client — it can contain the connection
  string with credentials. Log it server-side instead.

---

## 8. Traps that have already bitten us

These are real bugs that shipped. Read before touching the related area.

**1. Mongoose turns an `undefined` query value into a match on `null`.**
`Student.find({ parentEmail: user.email })` where the user has no email returned **35 of 42
students** — the parent portal listed other people's children. Always build `$or` branches
conditionally, only when the value exists. This is exactly what `childrenFilter` does; use it.

**2. A `!==` identifier comparison can fail *open*.**
The invoice ownership check was `student.parentEmail !== user.email`. For a phone-login parent it
wrongly denied their own child (a 403 on every online payment), and when both sides were `undefined`
the comparison was false, so it wrongly **granted** access to any student with no email on file. Use
`isMyChild()`.

**3. `unique` indexes must be `sparse` when the field is optional.**
Without `sparse`, the *second* record lacking the field collides on `null`. Mongoose will not alter
an existing index, so `utils/ensureUserIndexes.ts` drops and rebuilds the stale ones at boot. Also
note an empty string `""` is a real value to a sparse index — pre-validate hooks convert blank to
`undefined`.

**4. Mongoose mis-casts `$not: /regex/` on a String path** — it silently matches nothing.
`utils/normalizeStoredPhones.ts` works around it by using the native driver (`model.collection`) and
comparing in JS.

**5. Phone numbers must be normalised everywhere.**
`08235083251` and `+91 8235083251` and `8235083251` are the same person. `utils/phone.ts` is the only
correct implementation; model pre-save hooks apply it, and a boot-time pass fixes existing rows. A
parent stored in a non-canonical form logs in fine and matches **none** of their children.

**6. One invoice per (student, period, session).**
Checking per *fee structure* instead meant a class with two structures billed the student twice and
double-counted shared items like Transport. Consequence to remember: you **cannot** add a fee to a
month already generated by generating again — it is skipped. Exclude the class from the first run, or
delete that class's run and regenerate.

**7. Vite bakes `VITE_*` at build time.**
Changing a `VITE_` value needs a **rebuild**, not a restart. In Docker they must be `ARG` + `ENV` in
`frontend/Dockerfile` *and* `build.args` in compose. Editing `frontend/.env` on a server does
nothing: `frontend/.dockerignore` excludes `.env`, and empty compose build args would override it.

**8. A `mongodump` archive embeds its source database name** and will only restore into a database of
that same name (cross-database needs `--nsFrom` / `--nsTo`). Two consequences: restoring school A's
file into school B fails if the names differ — and **succeeds silently if they match**, which is why
every school gets its own `DB_NAME`.

**9. `tailwind.config.js` does not hot-reload.** New config keys silently produce no CSS until the
dev server restarts (symptom: a brand-coloured background renders transparent). Colours live in CSS
variables in `index.css` to avoid this.

**10. Small things that cost real time.** `twMerge` lets a later `flex` override a base `grid`.
A `const` used as a default parameter must be declared *before* the function (TDZ). iOS Safari
force-zooms the page when a focused input is under 16px. Stale `tsx watch` children keep holding
port 5000 — kill by PID, not `taskkill /IM node.exe`.

---

## 9. Environment variables

Every backend variable is read in `server/src/config/env.ts` and documented in
`server/.env.example`. Frontend variables are in `frontend/.env.example`. Docker uses
`.env.docker.example` → copied per school to `school1.env`, `school2.env`.

**Backend (25):** `PORT` `NODE_ENV` `MONGO_URI` `JWT_SECRET` `JWT_EXPIRE` `CLIENT_URL` `SCHOOL_NAME`
`SUPERADMIN_NAME` `SUPERADMIN_EMAIL` `SUPERADMIN_PASSWORD` `RAZORPAY_KEY_ID` `RAZORPAY_KEY_SECRET`
`ONLINE_PLATFORM_FEE_PCT` `LATE_FEE_PER_DAY` `LATE_FEE_MAX` `SCHOOL_UPI_VPA` `SCHOOL_UPI_NAME`
`BACKUP_DIR` `BACKUP_REMOTE` `RCLONE_CONFIG` `EMAIL_HOST` `EMAIL_PORT` `EMAIL_USER` `EMAIL_PASS`
`EMAIL_FROM`

**Frontend (17):** `VITE_API_URL` (defaults to `/api`, correct when nginx proxies same-origin) plus
16 branding vars: `VITE_SCHOOL_` + `NAME` `PLACE` `FULL_NAME` `SHORT_NAME` `MONOGRAM` `TAGLINE`
`INTRO` `DIRECTOR_NAME` `DIRECTOR_ROLE` `PRINCIPAL_NAME` `PRINCIPAL_ROLE` `ADDRESS` `PHONE` `EMAIL`
`ESTABLISHED` `AFFILIATION`. All are read in `frontend/src/lib/school.ts`, each falling back to an
R K Public School default — so a blank value on a *different* school shows the wrong name.

Two things that trip people up:

- **`SCHOOL_NAME` and `VITE_SCHOOL_NAME` are different settings and both must be set to the same
  value.** A printed receipt takes its heading from the backend and its address line from the
  frontend build, so a mismatch makes the receipt contradict itself. `SCHOOL_NAME` also names the
  backup files.
- The convenience-fee variable is **`ONLINE_PLATFORM_FEE_PCT`** (a percentage). A line named
  `ONLINE_PLATFORM_FEE` is silently ignored — that typo is live in at least one `.env`.

---

## 10. Deployment

Four production boxes, all Ubuntu:

1. **Oracle Cloud** — non-Docker: git clone, `pm2` process `sfms-api`, nginx webroot, MongoDB Atlas.
   Host nginx + certbot.
2. **AWS (original)** — non-Docker: `pm2`, nginx webroot, **self-hosted mongod with the school's real
   live data**. Treat this box's database as sacred. Host nginx + certbot.
3. **AWS (Docker)** — `docker compose` per the Docker guide, one mongo container per school. Host
   nginx + certbot.
4. **AWS (3 schools, 1 GB)** — `3.90.108.126`, key `schoolnew.pem`, serving
   `school1|school2|school3.smalltowncoder.in`. A **different** track: see `deploy/multi-school/` and
   Step 20 of the Docker guide. One shared mongod holding one database per school, and **Caddy**
   instead of host nginx + certbot, because three mongods do not fit in 1 GB. Schools 2 and 3 are
   placeholders — their `VITE_SCHOOL_*` values still say "Demo".

A paid Ubuntu VPS was also considered, to avoid relying on a free tier for something being sold.

Which track a box is on decides every command you run on it. Check for
`deploy/multi-school/infra.env` before assuming the root `docker-compose.yml` applies.

**Non-Docker update:** `git pull --ff-only`; backend `npm run build` + `pm2 restart sfms-api`;
frontend — **build locally on the PC** (1 GB boxes OOM on `vite build`), tar `frontend/dist`, scp,
back up the webroot, extract, `nginx -t && systemctl reload nginx`.

**Docker update:** `git pull origin main` then, per school,
`docker compose --env-file schoolN.env -p sfms_schoolN up -d --build`.

Boot-time migrations run automatically and are idempotent: stale non-sparse indexes are rebuilt and
stored phone numbers are normalised. No manual migration step.

> **Deployment state drifts.** The servers are usually behind `main`. Check
> `git log --oneline` against what is actually deployed before assuming a feature is live on a box.

---

## 11. Multi-school rules

One server runs several schools. Each is a **complete isolated stack** — its own mongo container,
volume, api and web container — namespaced by the compose project name (`-p sfms_school2`). Nothing
is shared but host nginx, the Docker engine, and the rclone config.

On a **small box** (`deploy/multi-school/`, box 4 above) the schools share one mongod and hold one
database each, so `DB_NAME` is what separates them and `MONGO_USER`/`MONGO_PASS` must match across the
env files. There is no `WEB_PORT`: nothing is published to the host and Caddy reaches each school by
container name. The networking there is load-bearing — every school's compose file names its services
`api` and `web`, so all of them on one Docker network would let one school's nginx resolve `api` to
another school's backend. Read the comment in `docker-compose.infra.yml` before changing a `networks:`
block.

**Must differ per school:** `WEB_PORT` (a clash means the second school will not start),
`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` and `SCHOOL_UPI_VPA` (money must reach the right school),
`DB_NAME` (see trap 8), `CLIENT_URL`, `SCHOOL_NAME` + all 16 `VITE_SCHOOL_*`, `SUPERADMIN_*`,
`JWT_SECRET`, `MONGO_PASS`, `BACKUP_REMOTE`.

**May be shared:** `MONGO_USER`, `JWT_EXPIRE`, `ONLINE_PLATFORM_FEE_PCT`, `LATE_FEE_*`,
`MONGO_CACHE_GB`, the `EMAIL_*` block.

Rough capacity, schools of 500–1000 students: 4 GB → 2 schools, 8 GB → 4–5, 24 GB → 10+. Mongo is the
memory-hungry part; `MONGO_CACHE_GB` (default 1) caps its cache. Disk and bandwidth are never the
constraint — a 1000-student school stays well under 1 GB a year.

---

## 12. How the owner wants work done

These are standing instructions, not preferences to re-negotiate.

- **Never touch the deployed servers** unless explicitly asked. Build and verify locally; the owner
  tests on localhost and then says when to deploy.
- **Discuss first, then build.** For any non-trivial feature the owner asks for the idea to be
  explained before it is implemented.
- **Commit only when asked.** Never push without being asked.
- **Commit messages: no `Co-Authored-By`, no AI attribution of any kind.** Style is
  `Area: short subject` followed by a wrapped paragraph explaining the why. See the git log.
- **Never commit secrets.** `.env`, `*.pem`, `ssh-key-*`, `school*.env` are gitignored — keep it that
  way. Real credentials must never reach `.env.example`. Move tokens machine-to-machine directly,
  never through a chat.
- **Verify against real data before claiming success.** The convention in this repo is to test
  against the actual database using throwaway records or an absurd future period (e.g. May 2031),
  then clean up completely and confirm the row counts are back to where they started. Report failures
  honestly with the output.
- The **PDF guides** at the repo root (`DEPLOYMENT_GUIDE`, `GDRIVE_BACKUP_SETUP`, `ORACLE_DEPLOYMENT`,
  `SCHOOL_ERP_FEATURES`) are intentionally **untracked** — they name servers, keys and accounts. The
  Docker guide, `DOCKER.md`, `deploy/multi-school/` and `deploy/backup/` **are** committed, because a
  deployment runbook nobody else can read is not a runbook. Keep it that way: procedure in the repo,
  specifics out of it.

---

## 13. Where the rest of the documentation lives

**In the repo — you have these from a plain clone, and they are enough to deploy and to set up
backups from scratch:**

| File | Covers |
|---|---|
| `DEPLOY_DOCKER_GUIDE.html` / `.pdf` | Docker deployment start to finish. **Step 20** is the runbook for the multi-school small-box layout; **Step 21** is renewing HTTPS when certbot expires |
| `DOCKER.md` | Short compose runbook |
| `deploy/multi-school/` | Compose files, `Caddyfile`, and `*.env.example` for the several-schools-one-box track |
| `deploy/backup/README.md` | **Backups end to end** — the Google Drive setup (§3b) the production boxes actually use, the multi-school Docker case, retention, and restoring |
| `deploy/backup/sfms-backup.sh`, `sfms-restore.sh`, `sfms-backup.env.sample` | The scripts and their config template |

**Not committed** — these hold server IPs, domains, SSH key filenames and the backup Google account,
so they stay on the owner's machine. Nothing in them is *required*: each has a committed equivalent
above. Ask the owner if you need the specifics.

| File | Covers | Committed equivalent |
|---|---|---|
| `DEPLOYMENT_GUIDE.md` / `.pdf` | Non-Docker (pm2 + nginx) deployment | §10 below has the update procedure |
| `GDRIVE_BACKUP_SETUP.pdf` | Connecting rclone to Google Drive | `deploy/backup/README.md` §3b |
| `ORACLE_DEPLOYMENT.pdf` | Oracle Cloud specifics | — |
| `SCHOOL_ERP_FEATURES.pdf` | Feature list for showing to schools | — |

> **Backups are the one thing with no committed fallback if you skip the README.** Read
> `deploy/backup/README.md` before touching a backup on any box — in particular §3b (Google Drive:
> use your *own* OAuth client, and publish the consent screen to Production or the token dies after
> 7 days) and the multi-school section (mongod is in a container with **no published port**, and each
> school is a **separate database** — one `MONGO_URI` backs up one school, not all of them).

---

## 14. Known gaps and deliberate omissions

- **Not built on purpose:** OTP signup (families have no email); Razorpay refunds (overpayment is
  adjusted against next month); grade-only / co-scholastic subjects (numeric marks only);
  subject-wise or period-wise attendance; half-day and late marks; per-class holidays; a configurable
  weekly-off day.
- **SMS / WhatsApp notifications do not exist.** Reminders are email-only, which is weak given most
  parents have no email. This is the most valuable missing feature.
- `DEPLOYMENT_GUIDE.md` is missing `ONLINE_PLATFORM_FEE_PCT` and does not list all 16
  `VITE_SCHOOL_*` variables.
- The `/receipt/:id` route allows `superadmin, admin, parent, student` but **not `teacher`**, so a
  staff member viewing their own child's fees cannot open a receipt. Nothing links there today, so
  nothing is broken.
- Receipt numbering counts documents, so two payments recorded in the same instant compute the same
  number. The unique index rejects the loser rather than duplicating, so money is never mis-recorded —
  but the cashier sees an error and has to retry. Fine at one fee counter; would need a proper counter
  if collection ever went concurrent.
- There is no automated test suite. Verification is done with throwaway scripts against the real
  database, as described in §12.

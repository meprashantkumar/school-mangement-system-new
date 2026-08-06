import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { logAudit, AUDIT } from "../utils/audit";
import { getSchoolSetting } from "../models/SchoolSetting";
import { CLASSES, classLabel, classesUpTo } from "../utils/academics";
import { Student } from "../models/Student";

// GET /api/settings -> the school's academic settings, plus the ladder they imply
export const getSettings = asyncHandler(async (_req, res) => {
  const setting = await getSchoolSetting();
  res.json({
    highestClass: setting.highestClass,
    classes: classesUpTo(setting.highestClass),
  });
});

// PUT /api/settings  { highestClass }
// Changing this does not touch a single student record — it only decides where
// promotion stops from now on. Lowering it while students sit in a class above the
// new limit would strand them, so that is refused with the count in the message.
export const updateSettings = asyncHandler(async (req, res) => {
  const { highestClass } = req.body;
  if (!highestClass || !CLASSES.includes(String(highestClass))) {
    throw new ApiError(400, "Choose a class from the list");
  }

  const allowed = classesUpTo(String(highestClass));
  const stranded = await Student.countDocuments({
    status: "active",
    class: { $nin: allowed },
  });
  if (stranded > 0) {
    throw new ApiError(
      400,
      `${stranded} student(s) are still studying above ${classLabel(
        String(highestClass)
      )}. Move or pass them out first, then lower this.`
    );
  }

  const setting = await getSchoolSetting();
  const before = setting.highestClass;
  setting.highestClass = String(highestClass);
  setting.updatedBy = req.user?._id;
  await setting.save();

  if (before !== setting.highestClass) {
    logAudit(
      req,
      AUDIT.STUDENT,
      `Highest class taught changed from ${classLabel(before)} to ${classLabel(setting.highestClass)}`
    );
  }

  res.json({
    message: `This school now teaches up to ${classLabel(setting.highestClass)}.`,
    highestClass: setting.highestClass,
    classes: classesUpTo(setting.highestClass),
  });
});

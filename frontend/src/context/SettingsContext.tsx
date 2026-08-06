import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import api from "@/lib/api";
import { DEFAULT_SESSION, setCachedSession } from "@/lib/constants";

export interface SessionReadiness {
  session: string;
  students: number;
  classTeachers: number;
  structures: number;
  holidays: number;
}

export interface SessionUndo {
  canUndo: boolean;
  /** The session in use now, which the undo would leave. */
  from?: string;
  /** The session it would go back to. */
  back?: string;
  changedAt?: string;
  /** Records entered since the change — these belong to `from` and stay there. */
  entered?: { students: number; admissions: number; exams: number; holidays: number; timetables: number };
}

interface SettingsContextType {
  /** The academic session the school is running — what every roster is read for. */
  currentSession: string;
  /** The year after it, offered when starting a new session. */
  nextSession: string;
  /** The last class this school teaches. */
  highestClass: string;
  /** The class ladder up to that class. */
  classes: string[];
  readiness: SessionReadiness | null;
  loading: boolean;
  refresh: () => Promise<void>;
  save: (changes: { highestClass?: string; currentSession?: string }) => Promise<string>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState({
    currentSession: DEFAULT_SESSION,
    nextSession: "",
    highestClass: "12",
    classes: [] as string[],
    readiness: null as SessionReadiness | null,
  });
  const [loading, setLoading] = useState(true);

  const apply = (data: any) => {
    setState({
      currentSession: data.currentSession || DEFAULT_SESSION,
      nextSession: data.nextSession || "",
      highestClass: data.highestClass || "12",
      classes: data.classes || [],
      readiness: data.readiness || null,
    });
    // Mirror the session into the module cache so the handful of non-React helpers
    // (CSV export defaults, seed values) agree with what the screens are showing.
    setCachedSession(data.currentSession);
  };

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/settings");
      apply(data);
    } catch {
      // A parent or a teacher cannot read school settings, and neither needs to —
      // leave the defaults in place rather than failing their whole page.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      setLoading(false);
      return;
    }
    refresh();
  }, [refresh]);

  const save = async (changes: { highestClass?: string; currentSession?: string }) => {
    const { data } = await api.put("/settings", changes);
    apply(data);
    return data.message as string;
  };

  return (
    <SettingsContext.Provider value={{ ...state, loading, refresh, save }}>
      {children}
    </SettingsContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
};

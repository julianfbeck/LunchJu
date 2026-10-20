import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Download, Check } from "lucide-react";
import { useI18n } from "./language";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const InstallContext = createContext<{
  prompt: InstallPrompt | null;
  installed: boolean;
  ios: boolean;
  install: () => Promise<void>;
} | null>(null);

export function PwaProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false),
    [ios, setIos] = useState(false);
  useEffect(() => {
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {
          // Installation is an enhancement; the online website remains usable.
        });
    }
    const display = window.matchMedia("(display-mode: standalone)");
    const isInstalled = () =>
      setInstalled(
        display.matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone ===
            true,
      );
    isInstalled();
    setIos(
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
    );
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const afterInstall = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", afterInstall);
    display.addEventListener("change", isInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", afterInstall);
      display.removeEventListener("change", isInstalled);
    };
  }, []);
  async function install() {
    if (!prompt) return;
    const current = prompt;
    setPrompt(null);
    try {
      await current.prompt();
      await current.userChoice;
    } catch {
      // The browser-menu instructions remain available.
    }
  }
  return (
    <InstallContext.Provider value={{ prompt, installed, ios, install }}>
      {children}
    </InstallContext.Provider>
  );
}

export function InstallApp() {
  const { t } = useI18n();
  const installation = useContext(InstallContext);
  if (!installation) throw new Error("InstallApp requires PwaProvider");
  const { prompt, installed, ios, install } = installation;
  return (
    <div className="install-app">
      {installed ? (
        <p className="helper-note">
          <Check size={16} />
          {t("LunchJu ist installiert.")}
        </p>
      ) : (
        <>
          {prompt && (
            <button className="secondary" onClick={() => void install()}>
              <Download size={17} />
              {t("App installieren")}
            </button>
          )}
          <p>
            {ios
              ? t(
                  "Auf dem iPhone: Öffne LunchJu in Safari, tippe auf Teilen und dann auf „Zum Home-Bildschirm“.",
                )
              : t(
                  "Öffne das Browsermenü und wähle „App installieren“ oder „Zum Startbildschirm hinzufügen“.",
                )}
          </p>
        </>
      )}
      <small>
        {t(
          "Die App benötigt eine Internetverbindung für Rezepte, Planung und Änderungen.",
        )}
      </small>
    </div>
  );
}

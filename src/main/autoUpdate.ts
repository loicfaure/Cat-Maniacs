import { app, type BrowserWindow, dialog } from "electron";
import electronUpdater from "electron-updater";

const { autoUpdater } = electronUpdater;

export function configureAutoUpdates(window: BrowserWindow): void {
  if (!app.isPackaged) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("error", (error) => {
    console.error("Automatic update failed", error);
  });
  autoUpdater.on("update-downloaded", async () => {
    if (window.isDestroyed()) {
      return;
    }

    const result = await dialog.showMessageBox(window, {
      type: "info",
      buttons: ["Redémarrer maintenant", "Plus tard"],
      defaultId: 0,
      cancelId: 1,
      title: "Mise à jour prête",
      message: "Une nouvelle version de Cha'Mania est prête à être installée.",
      detail:
        "Redémarrez l'application maintenant, ou elle sera installée automatiquement à la prochaine fermeture.",
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  void autoUpdater.checkForUpdates().catch((error: unknown) => {
    console.error("Automatic update check failed", error);
  });
}

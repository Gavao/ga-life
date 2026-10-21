package it.ga.life;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Guscio Android di GA Life: una WebView a tutto schermo che mostra l'app pubblicata su GitHub Pages.
 * Ogni modifica pubblicata arriva sul telefono alla riapertura, senza reinstallare l'APK; il service
 * worker la tiene in memoria per giocare anche offline. Qui resta solo ciò che il browser da solo non
 * fa bene: vibrazione, schermo acceso mentre giochi, condivisione, tasto Indietro e
 * aggiornamento dell'APK. La casa e i Sim restano nel telefono.
 */
public class MainActivity extends Activity {
    private static final String HOST = "gavao.github.io";
    private static final String HOME = "https://" + HOST + "/ga-life/";
    private static final String OFFLINE_PAGE = "<html><body style='background:#1a1426;color:#f8fafc;"
            + "font-family:sans-serif;text-align:center;padding:40% 24px'>"
            + "<p>Per il primo avvio GA Life ha bisogno della connessione a internet.</p>"
            + "<p><a href='" + HOME + "' style='color:#4ade80'>Riprova</a></p></body></html>";

    private WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xFF1A1426);
        getWindow().setNavigationBarColor(0xFF1A1426);

        web = new WebView(this);
        web.setBackgroundColor(0xFF1A1426);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(web);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(false);   // suoni del gioco

        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (HOST.equals(request.getUrl().getHost())) return false;
                openExternal(request.getUrl());
                return true;
            }

            // Solo se l'app non è mai stata aperta online: dopo, la serve il service worker.
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) view.loadDataWithBaseURL(HOME, OFFLINE_PAGE, "text/html", "utf-8", null);
            }
        });
        web.loadUrl(HOME);
    }

    /** Tasto Indietro: prima chiude la finestra aperta, poi torna indietro, infine esce. */
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.appBack ? window.appBack() : false", handled -> {
            if ("true".equals(handled)) return;
            if (web.canGoBack()) web.goBack();
            else finish();
        });
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception ignored) {
            // nessuna app in grado di aprirlo
        }
    }

    /**
     * Scarica il nuovo APK con il gestore download di Android e, finito, apre l'installazione.
     * La prima volta Android chiede di consentire a GA Life di installare app: si apre
     * l'impostazione apposita e, dopo averla attivata, basta toccare di nuovo "Aggiorna".
     */
    private void startUpdate(String url) {
        if (!getPackageManager().canRequestPackageInstalls()) {
            startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getPackageName())));
            return;
        }
        DownloadManager downloads = getSystemService(DownloadManager.class);
        java.io.File old = new java.io.File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "GALife-update.apk");
        if (old.exists()) old.delete();
        long id = downloads.enqueue(new DownloadManager.Request(Uri.parse(url))
                .setTitle("Aggiornamento GA Life")
                .setMimeType("application/vnd.android.package-archive")
                .setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, "GALife-update.apk")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE));

        BroadcastReceiver done = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) != id) return;
                unregisterReceiver(this);
                Uri apk = downloads.getUriForDownloadedFile(id);
                if (apk == null) return;   // download non riuscito
                startActivity(new Intent(Intent.ACTION_VIEW)
                        .setDataAndType(apk, "application/vnd.android.package-archive")
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK));
            }
        };
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(done, filter, Context.RECEIVER_EXPORTED);
        else registerReceiver(done, filter);
    }

    /** Funzioni native richiamabili dall'app web come window.Android. */
    private class Bridge {
        /** Versione dell'APK installato, es. "0.1": l'app web la confronta con l'ultima release su GitHub. */
        @JavascriptInterface
        public String appVersion() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "0";
            }
        }

        @JavascriptInterface
        public void installUpdate(String url) {
            runOnUiThread(() -> startUpdate(url));
        }

        /** Condivide un testo con un'altra app, dal menu di condivisione di Android. */
        @JavascriptInterface
        public void shareText(String title, String text) {
            Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain")
                    .putExtra(Intent.EXTRA_SUBJECT, title).putExtra(Intent.EXTRA_TEXT, text);
            runOnUiThread(() -> startActivity(Intent.createChooser(send, title)));
        }

        /** Vibrazione breve (millisecondi) per avvisi e azioni. */
        @JavascriptInterface
        public void vibrate(String ms) {
            try {
                Vibrator v = getSystemService(Vibrator.class);
                if (v != null && v.hasVibrator()) v.vibrate(VibrationEffect.createOneShot(Long.parseLong(ms.trim()), VibrationEffect.DEFAULT_AMPLITUDE));
            } catch (Exception ignored) {
                // vibrazione non disponibile
            }
        }

        /** Schermo sempre acceso mentre si gioca. */
        @JavascriptInterface
        public void keepScreenOn(boolean on) {
            runOnUiThread(() -> {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }
    }
}

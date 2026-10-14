package com.wesbos.homehq;

import android.app.Activity;
import android.net.Uri;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;

/** A first-party TEAMTRI pane beside the trusted Life menu. No bridge in TEAMTRI. */
final class LifeShell {
  private final Activity activity;
  private final WebView content;
  private final WebView rail;
  private final String todayUrl;
  private boolean teamtriLoaded;
  private final WebView teamtri;
  private final android.os.Handler retryHandler = new android.os.Handler(android.os.Looper.getMainLooper());

  static boolean accepts(String url) {
    if (url == null) return false;
    Uri u = Uri.parse(url);
    return "http".equals(u.getScheme()) && "192.168.50.111".equals(u.getHost())
        && u.getPort() == 8788 && "/".equals(u.getPath());
  }

  LifeShell(Activity owner, WebView existing, String url, Runnable controls) {
    activity = owner;
    content = existing;
    Uri base = Uri.parse(url);
    todayUrl = base.buildUpon().appendQueryParameter("content", "1").build().toString();
    final String railUrl = base.buildUpon().appendQueryParameter("rail", "1").build().toString();
    rail = new WebView(owner);
    rail.getSettings().setJavaScriptEnabled(true);
    rail.getSettings().setDomStorageEnabled(true);
    rail.setWebViewClient(new WebViewClient() {
      @Override public void onReceivedError(WebView view, int code, String description, String failingUrl) {
        if (accepts(failingUrl)) {
          retryHandler.removeCallbacksAndMessages(null);
          retryHandler.postDelayed(() -> rail.loadUrl(railUrl), 5000);
        }
      }
      @Override public boolean shouldOverrideUrlLoading(WebView view, String target) {
        return !accepts(target);
      }
    });
    rail.addJavascriptInterface(new Object() {
      @JavascriptInterface public void openTab(final String tab) {
        activity.runOnUiThread(() -> select(tab));
      }
      @JavascriptInterface public void showControls() {
        activity.runOnUiThread(controls);
      }
      @JavascriptInterface public void showAmbient() {
        activity.runOnUiThread(() -> {
          select("today");
          content.evaluateJavascript("window.showFrameAmbient()", null);
        });
      }
    }, "Frame");
    teamtri = new WebView(owner);
    teamtri.getSettings().setJavaScriptEnabled(true);
    teamtri.getSettings().setDomStorageEnabled(true);
    teamtri.getSettings().setUseWideViewPort(true);
    teamtri.setWebViewClient(new WebViewClient() {
      @Override public boolean shouldOverrideUrlLoading(WebView view, String target) {
        Uri u = Uri.parse(target);
        return !"https".equals(u.getScheme()) || !"teamtri.team".equals(u.getHost());
      }
    });
    LinearLayout layout = new LinearLayout(owner);
    layout.setOrientation(LinearLayout.HORIZONTAL);
    // Match the website's 142px rail at the frame's native CSS scale.
    int width = Math.round(142 * owner.getResources().getDisplayMetrics().density);
    layout.addView(rail, new LinearLayout.LayoutParams(width, -1));
    android.widget.FrameLayout pane = new android.widget.FrameLayout(owner);
    if (content.getParent() instanceof android.view.ViewGroup) {
      ((android.view.ViewGroup) content.getParent()).removeView(content);
    }
    pane.addView(content, new android.widget.FrameLayout.LayoutParams(-1, -1));
    pane.addView(teamtri, new android.widget.FrameLayout.LayoutParams(-1, -1));
    teamtri.setVisibility(View.GONE);
    layout.addView(pane, new LinearLayout.LayoutParams(0, -1, 1));
    owner.setContentView(layout);
    rail.loadUrl(railUrl);
    content.loadUrl(todayUrl);
  }

  void select(String tab) {
    boolean showTeam = "teamtri".equals(tab);
    if (!showTeam && !"today".equals(tab)) return;
    content.setVisibility(showTeam ? View.GONE : View.VISIBLE);
    teamtri.setVisibility(showTeam ? View.VISIBLE : View.GONE);
    if (!showTeam) content.evaluateJavascript("window.resumeFrameToday && window.resumeFrameToday()", null);
    if (showTeam && !teamtriLoaded) {
      teamtriLoaded = true;
      teamtri.loadUrl("https://teamtri.team/people-dashboard");
    }
    rail.evaluateJavascript("window.selectFrameTab('" + (showTeam ? "teamtri" : "today") + "')", null);
  }

  void showDarkAmbient() {
    select("today");
    content.evaluateJavascript("window.showFrameDarkAmbient && window.showFrameDarkAmbient()", null);
  }

  void back() {
    if (teamtri.getVisibility() == View.VISIBLE) select("today");
    else if (content.canGoBack()) content.goBack();
  }

  void destroy() {
    retryHandler.removeCallbacksAndMessages(null);
    rail.removeJavascriptInterface("Frame");
    rail.destroy();
    teamtri.destroy();
  }
}

package com.starlitcards.lanpreview;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;

public final class MainActivity extends Activity {
    private WebView web;
    private LanBridge lan;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(9,13,28));
        getWindow().setNavigationBarColor(Color.rgb(9,13,28));
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(9,13,28));
        WebSettings cfg = web.getSettings();
        cfg.setJavaScriptEnabled(true);
        cfg.setDomStorageEnabled(true);
        cfg.setAllowFileAccess(true);
        cfg.setAllowFileAccessFromFileURLs(false);
        cfg.setAllowUniversalAccessFromFileURLs(false);
        cfg.setBlockNetworkLoads(true);
        lan = new LanBridge(this,web);
        web.addJavascriptInterface(lan,"LocalLan");
        web.setWebViewClient(new WebViewClient());
        setContentView(web);
        web.loadUrl("file:///android_asset/lan/index.html");
    }
    @Override public void onBackPressed() {
        if(web!=null)web.evaluateJavascript("window.confirmExitLan&&window.confirmExitLan()",null);
        else super.onBackPressed();
    }
    @Override protected void onDestroy(){
        if(lan!=null)lan.close();
        if(web!=null){web.destroy();web=null;}
        super.onDestroy();
    }
}

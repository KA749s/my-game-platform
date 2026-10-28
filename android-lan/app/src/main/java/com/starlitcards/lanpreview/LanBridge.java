package com.starlitcards.lanpreview;

import android.app.Activity;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

public final class LanBridge {
    private static final int PORT=38643;
    private final Activity activity;
    private final WebView web;
    private final Object lock=new Object();
    private ServerSocket listener;
    private final List<Channel> guests=new ArrayList<>();
    private Channel host;
    private final AtomicInteger generation=new AtomicInteger();
    private int limit=3;
    private static final class Channel {
        final Socket socket;
        final BufferedWriter writer;
        final BufferedReader reader;
        final int seat;
        Channel(Socket socket,int seat)throws Exception{
            this.socket=socket;this.seat=seat;
            this.writer=new BufferedWriter(new OutputStreamWriter(socket.getOutputStream(),"UTF-8"));
            this.reader=new BufferedReader(new InputStreamReader(socket.getInputStream(),"UTF-8"));
        }
        void send(String text)throws Exception{
            if(text.length()>32768)throw new Exception("Message too long");
            synchronized(writer){writer.write(text);writer.write("\n");writer.flush();}
        }
        void close(){try{socket.close();}catch(Exception ignored){}}
    }
    LanBridge(Activity a,WebView w){activity=a;web=w;}
    private void emit(String kind,int seat,String payload){
        try{
            JSONObject data=new JSONObject().put("kind",kind).put("seat",seat).put("payload",payload);
            String arg=JSONObject.quote(data.toString());
            activity.runOnUiThread(()->web.evaluateJavascript("window.onNativeLan("+arg+")",null));
        }catch(Exception ignored){}
    }
    @JavascriptInterface public String address(){
        try {
            Enumeration<NetworkInterface> all=NetworkInterface.getNetworkInterfaces();
            while(all.hasMoreElements()){
                NetworkInterface ni=all.nextElement();
                if(!ni.isUp()||ni.isLoopback())continue;
                Enumeration<InetAddress> addrs=ni.getInetAddresses();
                while(addrs.hasMoreElements()){
                    InetAddress ip=addrs.nextElement();
                    if(ip instanceof Inet4Address&&ip.isSiteLocalAddress())return ip.getHostAddress();
                }
            }
        }catch(Exception ignored){}
        return "未检测到 Wi-Fi 地址";
    }
    @JavascriptInterface public void create(int size){
        close();
        final int generationId=generation.get();
        limit=size==2?2:3;
        new Thread(()->{
            try{
                ServerSocket server=new ServerSocket();
                server.setReuseAddress(true);
                server.bind(new InetSocketAddress(PORT));
                synchronized(lock){if(generationId!=generation.get()){server.close();return;}listener=server;}
                emit("listening",0,address());
                while(generationId==generation.get()){
                    Socket s=server.accept();
                    s.setSoTimeout(0);
                    s.setTcpNoDelay(true);
                    int seat=-1;
                    synchronized(lock){
                        for(int i=1;i<limit;i++){
                            boolean taken=false;
                            for(Channel c:guests)if(c.seat==i){taken=true;break;}
                            if(!taken){seat=i;break;}
                        }
                        if(seat>=0){Channel c=new Channel(s,seat);guests.add(c);c.send(new JSONObject().put("kind","welcome").put("seat",seat).toString());startReader(c,generationId,false);}
                    }
                    if(seat<0)try{s.close();}catch(Exception ignored){}
                    else emit("joined",seat,"");
                }
            }catch(Exception e){if(generationId==generation.get())emit("error",0,"房间关闭："+e.getClass().getSimpleName());}
        },"lan-server").start();
    }
    @JavascriptInterface public void join(String ip){
        if(ip==null||!ip.matches("([0-9]{1,3}\\.){3}[0-9]{1,3}")){emit("error",0,"请输入局域网 IPv4 地址");return;}
        try{for(String n:ip.split("\\."))if(Integer.parseInt(n)>255)throw new IllegalArgumentException();}catch(Exception e){emit("error",0,"IP 格式不正确");return;}
        close();
        final int generationId=generation.get();
        new Thread(()->{
            try{
                Socket s=new Socket();s.connect(new InetSocketAddress(ip,PORT),8000);
                s.setTcpNoDelay(true);
                Channel c=new Channel(s,0);
                synchronized(lock){if(generationId!=generation.get()){c.close();return;}host=c;}
                emit("connected",0,ip);
                startReader(c,generationId,true);
            }catch(Exception e){if(generationId==generation.get())emit("error",0,"连接失败：确认在同一 Wi-Fi 且房主已开房");}
        },"lan-join").start();
    }
    private void startReader(Channel c,int generationId,boolean fromHost){
        new Thread(()->{
            try{
                String line;
                while(generationId==generation.get()&&(line=c.reader.readLine())!=null){
                    if(line.length()>32768)break;
                    // Do not trust packets as JavaScript code; payload is JSON escaped at WebView boundary.
                    emit("message",fromHost?0:c.seat,line);
                }
            }catch(Exception ignored){}
            finally{
                c.close();
                synchronized(lock){if(fromHost){if(host==c)host=null;}else guests.remove(c);}
                if(generationId==generation.get())emit("left",fromHost?0:c.seat,"");
            }
        }, "lan-reader").start();
    }
    @JavascriptInterface public void send(int seat,String json){
        if(json==null||json.length()>32768)return;
        new Thread(()->{
            try{
                Channel c=null;
                synchronized(lock){
                    if(seat==0)c=host;
                    else for(Channel guest:guests)if(guest.seat==seat){c=guest;break;}
                }
                if(c!=null)c.send(json);
            }catch(Exception e){emit("error",seat,"发送失败");}
        },"lan-send").start();
    }
    @JavascriptInterface public void close(){
        generation.incrementAndGet();
        synchronized(lock){
            try{if(listener!=null)listener.close();}catch(Exception ignored){}
            listener=null;
            if(host!=null){host.close();host=null;}
            for(Channel c:guests)c.close();
            guests.clear();
        }
    }
}

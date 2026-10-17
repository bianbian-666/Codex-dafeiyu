using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
class DesktopBridge {
 [StructLayout(LayoutKind.Sequential)] struct Rect {public int L,T,R,B;}
 [StructLayout(LayoutKind.Sequential)] struct MonitorInfo {public int size;public Rect monitor,work;public uint flags;}
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h,uint flags);
 [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr h,ref MonitorInfo info);
 [DllImport("user32.dll")] static extern int GetClassName(IntPtr h,StringBuilder text,int count);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr h,int mode);
 [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a,uint b,bool attach);
 [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
 static bool Fullscreen() {
  var h=GetForegroundWindow(); if(h==IntPtr.Zero||IsIconic(h))return false;
  var name=new StringBuilder(128);GetClassName(h,name,128);
  if(name.ToString()=="Progman"||name.ToString()=="WorkerW"||name.ToString()=="Shell_TrayWnd")return false;
  uint pid;GetWindowThreadProcessId(h,out pid);
  try {if(Process.GetProcessById((int)pid).ProcessName=="CodexPet")return false;}catch{return false;}
  Rect r;if(!GetWindowRect(h,out r))return false;
  var m=new MonitorInfo();m.size=Marshal.SizeOf(m);if(!GetMonitorInfo(MonitorFromWindow(h,2),ref m))return false;
  return r.L<=m.monitor.L+2&&r.T<=m.monitor.T+2&&r.R>=m.monitor.R-2&&r.B>=m.monitor.B-2;
 }
 static int OpenCodex(string target) {
  foreach(var p in Process.GetProcesses())try{
   if(p.ProcessName!="ChatGPT"&&p.ProcessName!="Codex")continue;
   if(p.MainModule.FileName.IndexOf("Codex",StringComparison.OrdinalIgnoreCase)<0||p.MainWindowHandle==IntPtr.Zero)continue;
   var h=p.MainWindowHandle;uint ignored;uint fg=GetWindowThreadProcessId(GetForegroundWindow(),out ignored),me=GetCurrentThreadId();
   bool linked=fg!=0&&fg!=me&&AttachThreadInput(me,fg,true);
   try {ShowWindowAsync(h,IsIconic(h)?9:5);SetForegroundWindow(h);}finally{if(linked)AttachThreadInput(me,fg,false);}return 0;
  }catch{}
  try {
   if(File.Exists(target)){Process.Start(new ProcessStartInfo(target){UseShellExecute=true});return 0;}
   string[] id=target.Split('!');
   if(id.Length!=2||!Directory.Exists(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Packages",id[0])))return 1;
   Process.Start(new ProcessStartInfo("explorer.exe","shell:AppsFolder\\"+target){UseShellExecute=true});return 0;
  }catch{return 1;}
 }
 static int Main(string[] args) {
  if(args.Length==1&&args[0]=="--check-codex"){uint pid;GetWindowThreadProcessId(GetForegroundWindow(),out pid);try{return Process.GetProcessById((int)pid).MainModule.FileName.IndexOf("OpenAI.Codex",StringComparison.OrdinalIgnoreCase)>=0?0:1;}catch{return 1;}}
  if(args.Length==2&&args[0]=="--open-codex")return OpenCodex(args[1]);
  if(args.Length!=2)return 2;
  int parent=int.Parse(args[0]);string file=args[1];bool? last=null;
  while(true){try{if(Process.GetProcessById(parent).HasExited)return 0;}catch{return 0;}
   bool active=Fullscreen();if(last!=active){try{string tmp=file+".tmp";File.WriteAllText(tmp,"{\"fullscreen\":"+(active?"true":"false")+"}");if(File.Exists(file))File.Replace(tmp,file,null);else File.Move(tmp,file);last=active;}catch{}}
   Thread.Sleep(400);
  }
 }
}

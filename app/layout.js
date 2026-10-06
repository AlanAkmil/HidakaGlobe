import "./globals.css";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import { CESIUM_BASE } from "../lib/geo";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const body = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata = {
  title: "Hidaka Globe",
  authors: [{ name: "Alan" }],
  creator: "Alan",
  description:
    "Jelajahi bumi dalam 3D: medan, gedung, dan citra satelit dalam satu globe.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#04060c",
};

// Jalan sebelum render pertama supaya tema dan mode hemat tidak berkedip
const initScript = `(function(){var d=document.documentElement;try{var t=localStorage.getItem('hg-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}d.dataset.theme=t;var p=localStorage.getItem('hg-perf');if(p!=='low'&&p!=='normal'){var m=navigator.deviceMemory,c=navigator.hardwareConcurrency;p=((m&&m<=3)||(c&&c<=4))?'low':'normal'}d.dataset.perf=p}catch(e){d.dataset.theme='light';d.dataset.perf='normal'}})();`;

export default function RootLayout({ children }) {
  return (
    <html
      lang="id"
      className={`${display.variable} ${body.variable}`}
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://cesium.com" crossOrigin="" />
        <link rel="stylesheet" href={`${CESIUM_BASE}/Widgets/widgets.css`} />
        <script dangerouslySetInnerHTML={{ __html: initScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

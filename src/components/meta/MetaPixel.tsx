// src/components/meta/MetaPixel.tsx

import Script from "next/script";

export default function MetaPixel() {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const enabled =
    process.env.META_ENABLE_TRACKING !== "false" &&
    typeof pixelId === "string" &&
    pixelId.length > 0;

  const initScript = enabled
    ? `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s);}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');`
    : "";

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `window.__META_TRACKING_ENABLED=${
            enabled ? "true" : "false"
          };`,
        }}
      />
      {enabled ? (
        <Script id="meta-pixel" strategy="afterInteractive">
          {initScript}
        </Script>
      ) : null}
    </>
  );
}

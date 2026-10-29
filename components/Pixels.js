// Shop pages only (never /admin): the Meta Pixel and GA4 tags for the
// ids set in Settings, plus window.__ypTrack, which lib/track.js calls.
// One nonced inline script; the vendor SDKs it loads are allowed by the CSP's
// 'strict-dynamic'. Purchase is refused here: it is reported by the server only
// after an operator confirms the order.
import { headers } from 'next/headers';
import RouteEvents from './RouteEvents.js';

function loader({ meta, ga4 }) {
  const lines = [];
  if (meta) {
    lines.push(`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');`);
    lines.push(`fbq('init',${JSON.stringify(meta)});`);
  }
  if (ga4) {
    lines.push(`(function(){var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id='+${JSON.stringify(encodeURIComponent(ga4))};document.head.appendChild(s);})();`);
    lines.push(`window.dataLayer=window.dataLayer||[];window.gtag=function(){dataLayer.push(arguments)};gtag('js',new Date());gtag('config',${JSON.stringify(ga4)});`);
  }
  // Event dispatcher: one id per event, shared by the pixel and the server copy.
  lines.push(`(function(){
var GA={ViewContent:'view_item',AddToCart:'add_to_cart',InitiateCheckout:'begin_checkout',Search:'search',AddToWishlist:'add_to_wishlist'};
function id(n){return n.toLowerCase()+'-'+(crypto.randomUUID?crypto.randomUUID():'00000000-0000-4000-8000-'+String(Date.now()).slice(-12).padStart(12,'0'));}
window.__ypTrack=function(name,data){
  if(!name||name==='Purchase')return;
  data=data||{};var eid=id(name);
  ${meta ? `fbq('track',name,data,{eventID:eid});
  try{fetch('/api/capi',{method:'POST',keepalive:true,headers:{'content-type':'application/json'},body:JSON.stringify({event_name:name,event_id:eid,url:location.href,custom_data:data})}).catch(function(){});}catch(e){}` : ''}
  ${ga4 ? `if(name!=='PageView'&&GA[name]){var p={currency:data.currency,value:data.value};if(data.content_ids)p.items=data.content_ids.map(function(i){return{item_id:i,item_name:data.content_name}});if(data.search_string)p.search_term=data.search_string;gtag('event',GA[name],p);}` : ''}
};
})();`);
  return lines.join('\n');
}

export default async function Pixels({ tracking }) {
  const ids = {
    meta: tracking?.meta_pixel_id || null,
    ga4: tracking?.ga4_id || null,
  };
  if (!ids.meta && !ids.ga4) return null;
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <>
      <script nonce={nonce} dangerouslySetInnerHTML={{ __html: loader(ids) }} />
      <RouteEvents />
    </>
  );
}

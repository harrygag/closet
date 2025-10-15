(()=>{var a={};a.id=758,a.ids=[758],a.modules={36:(a,b,c)=>{"use strict";c.r(b),c.d(b,{handler:()=>J,patchFetch:()=>I,routeModule:()=>E,serverHooks:()=>H,workAsyncStorage:()=>F,workUnitAsyncStorage:()=>G});var d={};c.r(d),c.d(d,{POST:()=>C});var e=c(5736),f=c(9117),g=c(4044),h=c(9326),i=c(2324),j=c(261),k=c(4290),l=c(5328),m=c(8928),n=c(6595),o=c(3421),p=c(7679),q=c(1681),r=c(3446),s=c(6439),t=c(1356),u=c(641),v=c(6330),w=c(2995),x=c(5559),y=c(5511),z=c.n(y);let A=new v.PrismaClient,B=w.Ik({email:w.Yj().email("Invalid email address"),redirectTo:w.Yj().url().optional()});async function C(a){try{let b=await a.json(),c=B.parse(b),d=c.email.toLowerCase().trim(),e=await A.user.findUnique({where:{email:d}});e||(e=await A.user.create({data:{email:d,role:"SELLER"}}));let f=z().randomBytes(32).toString("hex"),g=new Date(Date.now()+9e5);await A.magicLink.create({data:{userId:e.id,email:d,token:f,expiresAt:g,ipAddress:a.headers.get("x-forwarded-for")||a.headers.get("x-real-ip")||"unknown",userAgent:a.headers.get("user-agent")||"unknown"}});let h=`http://localhost:3000/api/auth/verify?token=${f}${c.redirectTo?`&redirectTo=${encodeURIComponent(c.redirectTo)}`:""}`;return await D({to:d,magicLinkUrl:h,expiresInMinutes:15}),u.NextResponse.json({success:!0,message:"Magic link sent to your email",email:d,expiresInMinutes:15})}catch(a){if(a instanceof x.G)return u.NextResponse.json({error:"Invalid request",details:a.errors},{status:400});return console.error("Login error:",a),u.NextResponse.json({error:"Failed to send magic link"},{status:500})}}async function D(a){let{to:b,magicLinkUrl:c,expiresInMinutes:d}=a,e=process.env.RESEND_API_KEY;if(!e){console.log("\n=============================================="),console.log("\uD83D\uDD10 MAGIC LINK (Development Mode)"),console.log("=============================================="),console.log(`Email: ${b}`),console.log(`Link: ${c}`),console.log(`Expires in: ${d} minutes`),console.log("==============================================\n");return}let f=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${e}`,"Content-Type":"application/json"},body:JSON.stringify({from:process.env.EMAIL_FROM||"Virtual Closet Arcade <noreply@virtualcloset.app>",to:[b],subject:"\uD83C\uDFAE Your Virtual Closet Arcade Sign-In Link",html:`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Sign in to Virtual Closet Arcade</title>
        </head>
        <body style="margin: 0; padding: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
          <div style="max-width: 600px; margin: 40px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">

            <!-- Header -->
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
              <h1 style="margin: 0; color: white; font-size: 32px; font-weight: bold; text-shadow: 2px 2px 4px rgba(0,0,0,0.2);">
                🎮 Virtual Closet Arcade
              </h1>
              <p style="margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 16px;">
                Your AI-Powered Reseller Platform
              </p>
            </div>

            <!-- Content -->
            <div style="padding: 40px 30px;">
              <h2 style="margin: 0 0 20px; color: #2d3748; font-size: 24px;">Sign in to your account</h2>
              <p style="margin: 0 0 30px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Click the button below to securely sign in to Virtual Closet Arcade. This link will expire in <strong>${d} minutes</strong>.
              </p>

              <!-- CTA Button -->
              <div style="text-align: center; margin: 30px 0;">
                <a href="${c}"
                   style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 18px; font-weight: 600; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4); transition: transform 0.2s;">
                  🔓 Sign In to Virtual Closet Arcade
                </a>
              </div>

              <!-- Alternative Link -->
              <p style="margin: 30px 0 0; color: #718096; font-size: 14px; line-height: 1.6;">
                Or copy and paste this link into your browser:<br>
                <a href="${c}" style="color: #667eea; word-break: break-all;">${c}</a>
              </p>

              <!-- Security Notice -->
              <div style="margin-top: 40px; padding: 20px; background: #f7fafc; border-left: 4px solid #667eea; border-radius: 4px;">
                <p style="margin: 0; color: #4a5568; font-size: 14px; line-height: 1.6;">
                  <strong>🔒 Security Notice:</strong><br>
                  If you didn't request this sign-in link, you can safely ignore this email. The link will expire automatically.
                </p>
              </div>
            </div>

            <!-- Footer -->
            <div style="background: #f7fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 10px; color: #718096; font-size: 14px;">
                Need help? Reply to this email or visit our help center.
              </p>
              <p style="margin: 0; color: #a0aec0; font-size: 12px;">
                Virtual Closet Arcade &copy; ${new Date().getFullYear()}<br>
                AI-Powered Multi-Marketplace Reselling
              </p>
            </div>

          </div>
        </body>
        </html>
      `})});if(!f.ok)throw console.error("Failed to send email:",await f.text()),Error("Failed to send magic link email");console.log("Magic link email sent:",(await f.json()).id)}let E=new e.AppRouteRouteModule({definition:{kind:f.RouteKind.APP_ROUTE,page:"/api/auth/login/route",pathname:"/api/auth/login",filename:"route",bundlePath:"app/api/auth/login/route"},distDir:".next",relativeProjectDir:"",resolvedPagePath:"c:\\Users\\mickk\\closet\\app\\api\\auth\\login\\route.ts",nextConfigOutput:"standalone",userland:d}),{workAsyncStorage:F,workUnitAsyncStorage:G,serverHooks:H}=E;function I(){return(0,g.patchFetch)({workAsyncStorage:F,workUnitAsyncStorage:G})}async function J(a,b,c){var d;let e="/api/auth/login/route";"/index"===e&&(e="/");let g=await E.prepare(a,b,{srcPage:e,multiZoneDraftMode:!1});if(!g)return b.statusCode=400,b.end("Bad Request"),null==c.waitUntil||c.waitUntil.call(c,Promise.resolve()),null;let{buildId:u,params:v,nextConfig:w,isDraftMode:x,prerenderManifest:y,routerServerContext:z,isOnDemandRevalidate:A,revalidateOnlyGenerated:B,resolvedPathname:C}=g,D=(0,j.normalizeAppPath)(e),F=!!(y.dynamicRoutes[D]||y.routes[C]);if(F&&!x){let a=!!y.routes[C],b=y.dynamicRoutes[D];if(b&&!1===b.fallback&&!a)throw new s.NoFallbackError}let G=null;!F||E.isDev||x||(G="/index"===(G=C)?"/":G);let H=!0===E.isDev||!F,I=F&&!H,J=a.method||"GET",K=(0,i.getTracer)(),L=K.getActiveScopeSpan(),M={params:v,prerenderManifest:y,renderOpts:{experimental:{cacheComponents:!!w.experimental.cacheComponents,authInterrupts:!!w.experimental.authInterrupts},supportsDynamicResponse:H,incrementalCache:(0,h.getRequestMeta)(a,"incrementalCache"),cacheLifeProfiles:null==(d=w.experimental)?void 0:d.cacheLife,isRevalidate:I,waitUntil:c.waitUntil,onClose:a=>{b.on("close",a)},onAfterTaskError:void 0,onInstrumentationRequestError:(b,c,d)=>E.onRequestError(a,b,d,z)},sharedContext:{buildId:u}},N=new k.NodeNextRequest(a),O=new k.NodeNextResponse(b),P=l.NextRequestAdapter.fromNodeNextRequest(N,(0,l.signalFromNodeResponse)(b));try{let d=async c=>E.handle(P,M).finally(()=>{if(!c)return;c.setAttributes({"http.status_code":b.statusCode,"next.rsc":!1});let d=K.getRootSpanAttributes();if(!d)return;if(d.get("next.span_type")!==m.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${d.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let e=d.get("next.route");if(e){let a=`${J} ${e}`;c.setAttributes({"next.route":e,"http.route":e,"next.span_name":a}),c.updateName(a)}else c.updateName(`${J} ${a.url}`)}),g=async g=>{var i,j;let k=async({previousCacheEntry:f})=>{try{if(!(0,h.getRequestMeta)(a,"minimalMode")&&A&&B&&!f)return b.statusCode=404,b.setHeader("x-nextjs-cache","REVALIDATED"),b.end("This page could not be found"),null;let e=await d(g);a.fetchMetrics=M.renderOpts.fetchMetrics;let i=M.renderOpts.pendingWaitUntil;i&&c.waitUntil&&(c.waitUntil(i),i=void 0);let j=M.renderOpts.collectedTags;if(!F)return await (0,o.I)(N,O,e,M.renderOpts.pendingWaitUntil),null;{let a=await e.blob(),b=(0,p.toNodeOutgoingHttpHeaders)(e.headers);j&&(b[r.NEXT_CACHE_TAGS_HEADER]=j),!b["content-type"]&&a.type&&(b["content-type"]=a.type);let c=void 0!==M.renderOpts.collectedRevalidate&&!(M.renderOpts.collectedRevalidate>=r.INFINITE_CACHE)&&M.renderOpts.collectedRevalidate,d=void 0===M.renderOpts.collectedExpire||M.renderOpts.collectedExpire>=r.INFINITE_CACHE?void 0:M.renderOpts.collectedExpire;return{value:{kind:t.CachedRouteKind.APP_ROUTE,status:e.status,body:Buffer.from(await a.arrayBuffer()),headers:b},cacheControl:{revalidate:c,expire:d}}}}catch(b){throw(null==f?void 0:f.isStale)&&await E.onRequestError(a,b,{routerKind:"App Router",routePath:e,routeType:"route",revalidateReason:(0,n.c)({isRevalidate:I,isOnDemandRevalidate:A})},z),b}},l=await E.handleResponse({req:a,nextConfig:w,cacheKey:G,routeKind:f.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:y,isRoutePPREnabled:!1,isOnDemandRevalidate:A,revalidateOnlyGenerated:B,responseGenerator:k,waitUntil:c.waitUntil});if(!F)return null;if((null==l||null==(i=l.value)?void 0:i.kind)!==t.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==l||null==(j=l.value)?void 0:j.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});(0,h.getRequestMeta)(a,"minimalMode")||b.setHeader("x-nextjs-cache",A?"REVALIDATED":l.isMiss?"MISS":l.isStale?"STALE":"HIT"),x&&b.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let m=(0,p.fromNodeOutgoingHttpHeaders)(l.value.headers);return(0,h.getRequestMeta)(a,"minimalMode")&&F||m.delete(r.NEXT_CACHE_TAGS_HEADER),!l.cacheControl||b.getHeader("Cache-Control")||m.get("Cache-Control")||m.set("Cache-Control",(0,q.getCacheControlHeader)(l.cacheControl)),await (0,o.I)(N,O,new Response(l.value.body,{headers:m,status:l.value.status||200})),null};L?await g(L):await K.withPropagatedContext(a.headers,()=>K.trace(m.BaseServerSpan.handleRequest,{spanName:`${J} ${a.url}`,kind:i.SpanKind.SERVER,attributes:{"http.method":J,"http.target":a.url}},g))}catch(b){if(b instanceof s.NoFallbackError||await E.onRequestError(a,b,{routerKind:"App Router",routePath:D,routeType:"route",revalidateReason:(0,n.c)({isRevalidate:I,isOnDemandRevalidate:A})}),F)throw b;return await (0,o.I)(N,O,new Response(null,{status:500})),null}}},261:a=>{"use strict";a.exports=require("next/dist/shared/lib/router/utils/app-paths")},846:a=>{"use strict";a.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},3033:a=>{"use strict";a.exports=require("next/dist/server/app-render/work-unit-async-storage.external.js")},3295:a=>{"use strict";a.exports=require("next/dist/server/app-render/after-task-async-storage.external.js")},4870:a=>{"use strict";a.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},5511:a=>{"use strict";a.exports=require("crypto")},6330:a=>{"use strict";a.exports=require("@prisma/client")},6439:a=>{"use strict";a.exports=require("next/dist/shared/lib/no-fallback-error.external")},6487:()=>{},8335:()=>{},9121:a=>{"use strict";a.exports=require("next/dist/server/app-render/action-async-storage.external.js")},9294:a=>{"use strict";a.exports=require("next/dist/server/app-render/work-async-storage.external.js")}};var b=require("../../../../webpack-runtime.js");b.C(a);var c=b.X(0,[586,692,995],()=>b(b.s=36));module.exports=c})();
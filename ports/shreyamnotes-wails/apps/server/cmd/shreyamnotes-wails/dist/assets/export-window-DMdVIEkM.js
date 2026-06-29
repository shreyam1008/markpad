import{o as e}from"./rolldown-runtime-DAXXjFlN.js";import{i as t,n,t as r}from"./vendor-react-DUVq_3mI.js";import{n as i}from"./LazyPreview-BaezXIYj.js";import{l as a}from"./store-GXpqEeUB.js";/* empty css               */var o=e(t(),1),s=e(n(),1),c=r(),l=`zen:prefs:v2`,u={editorFontSize:16,editorLineHeight:1.7,previewMaxWidth:920,editorMaxWidth:920,contentAlign:`center`,interfaceFont:null,textFont:null,monoFont:null};function d(e){return typeof e==`string`&&e.trim()?e:null}function f(e,t){return typeof e==`number`&&Number.isFinite(e)?e:t}function p(){try{let e=window.localStorage.getItem(l);if(!e)return u;let t=JSON.parse(e),n=t.contentAlign===`left`?`left`:`center`;return{editorFontSize:f(t.editorFontSize,u.editorFontSize),editorLineHeight:f(t.editorLineHeight,u.editorLineHeight),previewMaxWidth:f(t.previewMaxWidth,u.previewMaxWidth),editorMaxWidth:f(t.editorMaxWidth,u.editorMaxWidth),contentAlign:n,interfaceFont:d(t.interfaceFont),textFont:d(t.textFont),monoFont:d(t.monoFont)}}catch{return u}}var m=`7.1in`;function h(e){let t=document.documentElement;t.dataset.theme=`github-light`,t.dataset.contentAlign=e.contentAlign,t.setAttribute(`data-opaque`,``),t.style.colorScheme=`light`,t.style.setProperty(`--z-editor-font-size`,`${e.editorFontSize}px`),t.style.setProperty(`--z-editor-line-height`,String(e.editorLineHeight)),t.style.setProperty(`--z-preview-max-width`,`min(${e.previewMaxWidth}px, ${m})`),t.style.setProperty(`--z-editor-max-width`,`min(${e.editorMaxWidth}px, ${m})`);let n=(e,n,r)=>{n?t.style.setProperty(e,`"${n}", ${r}`):t.style.removeProperty(e)};n(`--z-interface-font`,e.interfaceFont,`-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, system-ui, sans-serif`),n(`--z-text-font`,e.textFont,`"SF Mono", "SFMono-Regular", ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace`),n(`--z-mono-font`,e.monoFont,`"SF Mono", "SFMono-Regular", ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace`)}function g({notePath:e}){let[t,n]=(0,o.useState)(null),[r,s]=(0,o.useState)(null),l=(0,o.useRef)(!1);(0,o.useEffect)(()=>{h(p());let t=!1;return(async()=>{try{let[r,i,o,s]=await Promise.all([window.zen.getCurrentVault(),window.zen.listNotes(),window.zen.listAssets(),window.zen.readNote(e)]);if(t)return;if(!r)throw Error(`No active vault was available for PDF export.`);a.setState({vault:r,notes:i,assetFiles:o,selectedPath:s.path,activeNote:s}),document.title=`${s.title}.pdf`,n(s)}catch(e){if(t)return;s(e instanceof Error?e.message:String(e))}})(),()=>{t=!0}},[e]);let u=async()=>{if(!l.current){l.current=!0;try{`fonts`in document&&document.fonts?.ready&&await document.fonts.ready}catch{}requestAnimationFrame(()=>{requestAnimationFrame(()=>{window.print()})})}};return r?(0,c.jsx)(`main`,{className:`min-h-screen bg-white px-10 py-12 text-ink-900`,children:(0,c.jsxs)(`div`,{className:`mx-auto max-w-3xl rounded-2xl border border-red-200 bg-white px-6 py-5`,children:[(0,c.jsx)(`h1`,{className:`text-xl font-semibold text-red-700`,children:`PDF export failed`}),(0,c.jsx)(`p`,{className:`mt-3 whitespace-pre-wrap text-sm leading-7 text-ink-700`,children:r})]})}):t?(0,c.jsxs)(c.Fragment,{children:[(0,c.jsx)(`style`,{children:`
        @page {
          margin: 0.7in;
        }
        html,
        body,
        #root {
          height: auto !important;
          min-height: 0 !important;
          overflow: visible !important;
          background: #ffffff !important;
        }
        body,
        #root {
          display: block !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        body {
          user-select: text !important;
        }
        .export-note-shell {
          min-height: auto;
          width: 100%;
          overflow: visible;
          background: #ffffff;
          color: rgb(var(--z-fg));
        }
        .export-note-shell .prose-zen {
          padding: 32px 40px 48px;
        }
        @media print {
          html,
          body,
          #root {
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            background: #ffffff !important;
          }
          .export-note-shell {
            min-height: auto;
            overflow: visible;
          }
          .export-note-shell .prose-zen {
            max-width: none;
            width: 100%;
            padding: 0;
            margin: 0;
          }
        }
      `}),(0,c.jsx)(`main`,{className:`export-note-shell`,children:(0,c.jsx)(i,{markdown:t.body,notePath:t.path,onRendered:()=>void u()})})]}):(0,c.jsx)(`main`,{className:`min-h-screen bg-white px-10 py-12 text-ink-900`,children:(0,c.jsx)(`div`,{className:`mx-auto max-w-3xl rounded-2xl border border-ink-200 bg-white px-6 py-5`,children:(0,c.jsx)(`p`,{className:`text-sm leading-7 text-ink-700`,children:`Preparing note export…`})})})}function _(e,t){s.createRoot(e).render((0,c.jsx)(g,{notePath:t}))}export{_ as renderExportNoteWindow};
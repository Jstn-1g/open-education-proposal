const frame=document.querySelector('#learning-demo');
window.addEventListener('message',event=>{
  if(event.origin!==location.origin || event.source!==frame.contentWindow || event.data?.type!=='learning-lab-height')return;
  const height=event.data.height;
  // Expanded explanations with enlarged/spaced text can legitimately exceed 10k px.
  // Retain a finite bound and the exact-origin / exact-frame checks above.
  if(Number.isFinite(height)&&height>=300&&height<=50000)frame.style.height=Math.ceil(height)+'px';
});

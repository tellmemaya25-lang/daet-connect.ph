// Usage: <div class="q" data-q='{"q":"...","opts":["a","b"],"ans":1,"why":"..."}'></div>
document.querySelectorAll('.q[data-q]').forEach(el=>{
  const d=JSON.parse(el.dataset.q);
  el.innerHTML='<p><strong>'+d.q+'</strong></p>';
  const fb=document.createElement('div');fb.className='fb';
  d.opts.forEach((o,i)=>{const b=document.createElement('button');b.textContent=o;
    b.onclick=()=>{el.querySelectorAll('button').forEach(x=>x.className='');
      b.className=i===d.ans?'ok':'no';
      fb.textContent=i===d.ans?'Correct. '+d.why:'Not quite. Try again, then recall why.';};
    el.appendChild(b);});
  el.appendChild(fb);
});

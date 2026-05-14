// EconSquad Inbox CSS Injection
(function(){
var s=document.getElementById('esqCSS');if(s)return;
s=document.createElement('style');s.id='esqCSS';
s.textContent='.email-card-v2{background:rgba(14,20,36,0.85);border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:18px 20px;margin-bottom:10px;cursor:pointer;transition:border-color .2s,transform .15s}'
+'.email-card-v2:hover{border-color:rgba(170,255,62,0.25);background:rgba(20,28,50,0.92);transform:translateY(-1px)}'
+'.email-card-v2.tag-rfi{border-left:3px solid #64afff}'
+'.email-card-v2.tag-grant{border-left:3px solid #f5c542}'
+'.email-card-v2.tag-bre{border-left:3px solid #32e1c8}'
+'.email-card-v2.tag-incentive{border-left:3px solid #c88cff}'
+'.email-card-v2.tag-workforce{border-left:3px solid #aaff3e}'
+'.email-card-v2.tag-prospect{border-left:3px solid #ff9b41}'
+'.email-card-v2.tag-bounce{border-left:3px solid rgba(255,80,80,0.9)}'
+'.email-card-v2.tag-appt,.email-card-v2.tag-cal{border-left:3px solid #aaff3e}'
+'.email-card-v2.tag-market{border-left:3px solid #ff9b41}'
+'.email-card-v2.tag-travel{border-left:3px solid #82dcff}'
+'.email-card-v2.tag-subscr{border-left:3px solid #c88cff}'
+'.email-card-v2.tag-health{border-left:3px solid #32e1c8}'
+'.email-card-v2.tag-alert,.email-card-v2.tag-survey{border-left:3px solid #82dcff}'
+'.email-card-v2.tag-promo{border-left:3px solid rgba(255,220,100,0.5)}'
+'.email-card-v2.tag-system,.email-card-v2.tag-support,.email-card-v2.tag-email{border-left:3px solid rgba(255,255,255,0.12)}'
+'.email-card-top{display:flex;align-items:center;gap:12px;margin-bottom:10px}'
+'.email-avatar-v2{width:42px;height:42px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-family:Barlow,sans-serif;font-size:15px;font-weight:800}'
+'.email-sender-block{flex:1;min-width:0}'
+'.email-sender-name{font-family:Barlow,sans-serif;font-size:15px;font-weight:800;color:#eef3fc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px}'
+'.email-sender-addr{font-size:11px;color:#4a5568;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
+'.email-meta-right{display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0}'
+'.email-time{font-size:12px;color:#6b7a96;white-space:nowrap}'
+'.email-type-tag{font-family:Barlow,sans-serif;font-size:10px;font-weight:800;padding:3px 10px;border-radius:20px;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}'
+'.email-subject{font-size:14px;font-weight:600;color:#eef3fc;margin-bottom:6px;line-height:1.4}'
+'.email-preview{font-size:13px;color:#6b7a96;line-height:1.6;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}'
+'.email-footer-actions{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}'
+'.email-action-btn{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:#6b7a96;font-size:11px;font-weight:600;padding:5px 12px;border-radius:8px;cursor:pointer;transition:all .15s}'
+'.email-action-btn:hover{background:rgba(170,255,62,0.08);border-color:rgba(170,255,62,0.25);color:#aaff3e}'
+'.email-action-btn.primary{background:rgba(170,255,62,0.1);border-color:rgba(170,255,62,0.3);color:#aaff3e}'
+'.email-action-btn.danger{background:rgba(255,80,80,0.08);border-color:rgba(255,80,80,0.25);color:#ff8080}'
+'.cal-card-v2{background:rgba(14,20,36,0.8);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:14px 16px;margin-bottom:10px;display:flex;align-items:center;gap:14px;cursor:pointer;transition:border-color .2s,transform .15s}'
+'.cal-icon-circle{width:42px;height:42px;border-radius:12px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:20px}'
+'.cal-card-body{flex:1;min-width:0}'
+'.cal-title{font-family:Barlow,sans-serif;font-size:14px;font-weight:800;color:#eef3fc;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
+'.cal-pill{font-size:10px;font-weight:700;padding:2px 9px;border-radius:20px;font-family:Barlow,sans-serif}'
+'.coming-up-row{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:10px;margin-bottom:6px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);cursor:pointer}'
+'.coming-date{font-size:11px;color:#4a5568;min-width:64px}'
+'.coming-title{font-size:13px;font-weight:600;color:#b8c8e0;flex:1}'
+'.coming-icon{font-size:16px;flex-shrink:0}'
+'@media(max-width:768px){.scroll-area{padding-bottom:90px!important}#inbox-tab{padding-bottom:100px!important}#inbox-grid{grid-template-columns:1fr!important}}'
;
document.head.appendChild(s);
})();

(function(){
var TK='esqTrashLog';
function gTL(){try{return JSON.parse(localStorage.getItem(TK)||'{}')}catch(e){return{}}}
function sTL(l){try{localStorage.setItem(TK,JSON.stringify(l))}catch(e){}}
function eH(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

function getTag(from,subj,snip){
  var a=((subj||'')+(snip||'')+(from||'')).toLowerCase();
  if(/(rfi|request for information|site selection)/.test(a))return{l:'RFI',c:'#64afff',bg:'rgba(100,175,255,0.15)',bd:'rgba(100,175,255,0.35)',i:'\u{1F4CD}',p:true};
  if(/(grant|cdbg|eda|usda|funding|weda)/.test(a))return{l:'GRANT',c:'#f5c542',bg:'rgba(245,197,66,0.15)',bd:'rgba(245,197,66,0.35)',i:'\u{1F4B0}',p:true};
  if(/(bre|business retention)/.test(a))return{l:'BRE',c:'#32e1c8',bg:'rgba(50,225,200,0.15)',bd:'rgba(50,225,200,0.35)',i:'\u{1F91D}',p:true};
  if(/(incentive|tax credit|abatement)/.test(a))return{l:'INCENTIVE',c:'#c88cff',bg:'rgba(200,140,255,0.15)',bd:'rgba(200,140,255,0.35)',i:'\u{1F48E}',p:true};
  if(/(workforce|labor|talent|training)/.test(a))return{l:'WORKFORCE',c:'#aaff3e',bg:'rgba(170,255,62,0.15)',bd:'rgba(170,255,62,0.35)',i:'\u{1F477}',p:true};
  if(/(prospect|generate leads|attendee)/.test(a))return{l:'PROSPECT',c:'#ff9b41',bg:'rgba(255,155,65,0.15)',bd:'rgba(255,155,65,0.35)',i:'\u{1F3AF}',p:true};
  if(/(undeliverable|bounced|could not be delivered)/.test(a))return{l:'BOUNCE',c:'#ff8080',bg:'rgba(255,80,80,0.12)',bd:'rgba(255,80,80,0.7)',i:'\u26A0',bounce:true};
  if(/(appointment|appoint)/.test(a))return{l:'APPT',c:'#aaff3e',bg:'rgba(170,255,62,0.12)',bd:'rgba(170,255,62,0.6)',i:'\u{1F4C5}'};
  if(/(calendar|no events|invitation)/.test(a))return{l:'CAL',c:'#64afff',bg:'rgba(100,175,255,0.12)',bd:'rgba(100,175,255,0.5)',i:'\u{1F5D3}'};
  if(/(loopnet|listing|commercial real estate)/.test(a))return{l:'SITE',c:'#64afff',bg:'rgba(100,175,255,0.12)',bd:'rgba(100,175,255,0.5)',i:'\u{1F3E2}'};
  if(/(github|gitlab|jira)/.test(a))return{l:'SYSTEM',c:'#6b7a96',bg:'rgba(165,185,210,0.10)',bd:'rgba(165,185,210,0.4)',i:'\u2699'};
  if(/(ebay|marketplace|bid|auction)/.test(a))return{l:'MARKET',c:'#ff9b41',bg:'rgba(255,155,65,0.10)',bd:'rgba(255,155,65,0.5)',i:'\u{1F6D2}'};
  if(/(airline|flight|hotel|travel|trip)/.test(a))return{l:'TRAVEL',c:'#82dcff',bg:'rgba(130,220,255,0.12)',bd:'rgba(130,220,255,0.5)',i:'\u2708'};
  if(/(netflix|hulu|disney|spotify|membership|subscription)/.test(a))return{l:'SUBSCR',c:'#c88cff',bg:'rgba(200,140,255,0.10)',bd:'rgba(200,140,255,0.5)',i:'\u{1F4FA}'};
  if(/(walgreens|pharmacy|health|medical)/.test(a))return{l:'HEALTH',c:'#32e1c8',bg:'rgba(50,225,200,0.10)',bd:'rgba(50,225,200,0.5)',i:'\u{1F48A}'};
  if(/(survey|feedback|recommend)/.test(a))return{l:'SURVEY',c:'#a5b9d2',bg:'rgba(165,185,210,0.10)',bd:'rgba(165,185,210,0.4)',i:'\u2B50'};
  if(/(newsletter|digest|alert|notification)/.test(a))return{l:'ALERT',c:'#82dcff',bg:'rgba(130,220,255,0.12)',bd:'rgba(130,220,255,0.5)',i:'\u{1F514}'};
  if(/(sale|promo|discount|coupon)/.test(a))return{l:'PROMO',c:'#b8930a',bg:'rgba(255,220,100,0.08)',bd:'rgba(255,220,100,0.4)',i:'\u{1F3F7}'};
  if(/(support|ticket|help)/.test(a))return{l:'SUPPORT',c:'#6b7a96',bg:'rgba(255,255,255,0.06)',bd:'rgba(255,255,255,0.2)',i:'\u{1F527}'};
  return{l:'EMAIL',c:'#4a5568',bg:'rgba(255,255,255,0.04)',bd:'rgba(255,255,255,0.12)',i:'\u2709'};
}

function gAC(n){var c=['linear-gradient(135deg,#aaff3e,#5a9900)','linear-gradient(135deg,#64afff,#1e40af)','linear-gradient(135deg,#f5c542,#a06800)','linear-gradient(135deg,#32e1c8,#065f5b)','linear-gradient(135deg,#c88cff,#4a1d96)','linear-gradient(135deg,#ff9b41,#7c2d12)'];var h=0;for(var i=0;i<n.length;i++)h=n.charCodeAt(i)+((h<<5)-h);return c[Math.abs(h)%c.length];}
function gIn(f){var n=(f||'').replace(/<[^>]*>/g,'').trim()||'?';var p=n.split(' ').filter(Boolean);if(p.length>=2)return(p[0][0]+(p[p.length-1][0]||'')).toUpperCase();return(n[0]||'?').toUpperCase()+(n[1]||'').toUpperCase();}
function gSN(f){f=f||'';var m=f.match(/^"?([^"<]+)"?\s*</);if(m&&m[1].trim())return m[1].trim();return f.replace(/<[^>]*>/g,'').trim()||f.split('@')[0]||'Unknown';}

window.openEmailDetail=function(emailData){
  var email=typeof emailData==='string'?JSON.parse(emailData):emailData;
  var ex=document.getElementById('esqDetail');if(ex)ex.remove();
  var tag=getTag(email.from||'',email.subject||'',email.snippet||'');
  var sn=gSN(email.from||'');
  var d=new Date(email.date),now=new Date();
  var ds=isNaN(d)?'':(d.toDateString()===now.toDateString()?d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}));
  var overlay=document.createElement('div');overlay.id='esqDetail';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:8000;display:flex;align-items:flex-end;';
  overlay.onclick=function(e){if(e.target===overlay)overlay.remove();};
  var modal=document.createElement('div');
  modal.style.cssText='background:#0b1120;border-radius:20px 20px 0 0;border:1px solid rgba(255,255,255,0.08);width:100%;max-height:85vh;overflow-y:auto;padding:24px 20px 100px;position:relative;';
  var handle=document.createElement('div');handle.style.cssText='width:40px;height:4px;background:rgba(255,255,255,0.15);border-radius:2px;margin:0 auto 20px;';modal.appendChild(handle);
  var xBtn=document.createElement('button');xBtn.textContent='\u2715';xBtn.style.cssText='position:absolute;top:16px;right:16px;width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.08);border:none;color:#6b7a96;font-size:16px;cursor:pointer;';xBtn.onclick=function(){overlay.remove();};modal.appendChild(xBtn);
  if(tag){var ts=document.createElement('span');ts.className='email-type-tag';ts.style.cssText='background:'+tag.bg+';color:'+tag.c+';border:1px solid '+tag.bd+';display:inline-block;margin-bottom:12px;';ts.textContent=tag.i+' '+tag.l;modal.appendChild(ts);}
  var fd=document.createElement('div');fd.style.cssText='font-size:12px;color:#4a5568;margin-bottom:4px;';fd.textContent=sn+' \u00B7 '+ds;modal.appendChild(fd);
  var sd=document.createElement('div');sd.style.cssText='font-family:Barlow,sans-serif;font-size:18px;font-weight:800;color:#eef3fc;margin-bottom:16px;line-height:1.3;';sd.textContent=email.subject||'(no subject)';modal.appendChild(sd);
  var bd=document.createElement('div');bd.style.cssText='font-size:14px;color:#8a9bb8;line-height:1.7;word-break:break-word;';bd.textContent=email.snippet||'No preview available.';modal.appendChild(bd);
  var ad=document.createElement('div');ad.style.cssText='display:flex;gap:10px;margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.06);flex-wrap:wrap;';
  if(tag&&tag.l==='RFI'){var rb=document.createElement('button');rb.className='email-action-btn primary';rb.innerHTML='Deploy Riley &#8599;';rb.onclick=function(){if(typeof deploy==='function')deploy(21);overlay.remove();};ad.appendChild(rb);}
  else if(tag&&tag.l==='GRANT'){var gb=document.createElement('button');gb.className='email-action-btn primary';gb.innerHTML='Grant Writer &#8599;';gb.onclick=function(){if(typeof deploy==='function')deploy(1);overlay.remove();};ad.appendChild(gb);}
  var replyB=document.createElement('button');replyB.className='email-action-btn';replyB.textContent='Reply';replyB.onclick=function(){var m=(email.from||'').match(/<([^>]+)>/);var to=m?m[1]:(email.from||'');window.open('https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(to)+'&su='+encodeURIComponent('Re: '+(email.subject||'')));};ad.appendChild(replyB);
  var archB=document.createElement('button');archB.className='email-action-btn';archB.textContent='Archive';archB.onclick=function(){overlay.remove();window.archiveCard(email.id||'');};ad.appendChild(archB);
  var tb=document.createElement('button');tb.className='email-action-btn danger';tb.textContent='\u{1F5D1} Trash';tb.onclick=function(){window.trashCard(email.id||'');overlay.remove();};ad.appendChild(tb);
  var cb=document.createElement('button');cb.className='email-action-btn';cb.textContent='Close';cb.onclick=function(){overlay.remove();};ad.appendChild(cb);
  modal.appendChild(ad);overlay.appendChild(modal);document.body.appendChild(overlay);
};

window.trashCard=function(eid){
  var token=window.providerToken||null;
  var log=gTL();log[eid]=Date.now();sTL(log);
  if(token)fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+eid+'/trash',{method:'POST',headers:{'Authorization':'Bearer '+token}}).catch(function(){});
  var card=document.querySelector('[data-eid="'+eid+'"]');
  if(card){card.style.cssText='opacity:0.3;transform:translateX(12px);transition:all .35s;';setTimeout(function(){card.remove();showTB();},380);}else{showTB();}
};

window.replyToCard=function(eid){
  var card=document.querySelector('[data-eid="'+eid+'"]');if(!card)return;
  try{var em=JSON.parse(card.getAttribute('data-email'));var m=(em.from||'').match(/<([^>]+)>/);var to=m?m[1]:(em.from||'');window.open('https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(to)+'&su='+encodeURIComponent('Re: '+(em.subject||'')));}catch(e){}
};

window.archiveCard=function(eid){
  var token=window.providerToken||null;if(!token){alert('Gmail not connected');return;}
  var card=document.querySelector('[data-eid="'+eid+'"]');
  if(card){card.style.cssText='opacity:0.3;transform:translateX(12px);transition:all .35s;';setTimeout(function(){card.remove();},380);}
  fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+eid+'/modify',{method:'POST',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({removeLabelIds:['INBOX']})}).catch(function(){if(card)card.style.cssText='';});
};

window.emptyTrash=function(){
  var log=gTL(),ids=Object.keys(log);if(!ids.length)return;
  if(!confirm('Permanently delete all '+ids.length+' trashed emails?'))return;
  var token=window.providerToken||null;if(!token)return;
  Promise.all(ids.map(function(id){return fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+id,{method:'DELETE',headers:{'Authorization':'Bearer '+token}}).catch(function(){});})).then(function(){sTL({});var b=document.getElementById('esqTB');if(b)b.remove();});
};

window.autoPurge=function(){
  var token=window.providerToken||null;if(!token)return;
  var log=gTL(),now=Date.now(),cut=30*24*60*60*1000,old=Object.keys(log).filter(function(id){return(now-log[id])>cut;});
  if(!old.length)return;
  Promise.all(old.map(function(id){return fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+id,{method:'DELETE',headers:{'Authorization':'Bearer '+token}}).then(function(){delete log[id];}).catch(function(){});})).then(function(){sTL(log);});
};

function showTB(){
  var log=gTL(),ids=Object.keys(log);var ex=document.getElementById('esqTB');if(ex)ex.remove();if(!ids.length)return;
  var list=document.getElementById('email-list');if(!list||!list.parentElement)return;
  var b=document.createElement('div');b.id='esqTB';
  b.style.cssText='background:rgba(255,80,80,0.07);border:1px solid rgba(255,80,80,0.2);border-radius:12px;padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;';
  var txt=document.createElement('span');txt.style.cssText='font-size:12px;color:#ff8080;';txt.textContent='\u{1F5D1}\uFE0F '+ids.length+' in trash \u00B7 Auto-purge after 30 days';
  var btn=document.createElement('button');btn.style.cssText='font-size:11px;font-weight:700;padding:5px 14px;border-radius:8px;cursor:pointer;background:rgba(255,80,80,0.15);border:1px solid rgba(255,80,80,0.35);color:#ff8080;';btn.textContent='Empty Trash';btn.onclick=window.emptyTrash;
  b.appendChild(txt);b.appendChild(btn);list.parentElement.insertBefore(b,list);
}

function renderCard(email){
  var tag=getTag(email.from||'',email.subject||'',email.snippet||'');
  var sn=gSN(email.from||'');
  var rE=(email.from||'').match(/<([^>]+)>/);var sA=rE?rE[1]:((email.from||'').indexOf('@')>-1?email.from:'');
  var d=new Date(email.date),now=new Date();
  var ts=isNaN(d)?'':(d.toDateString()===now.toDateString()?d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString('en-US',{month:'short',day:'numeric'}));
  var tc=tag?(' tag-'+tag.l.toLowerCase().replace(/[^a-z]/g,'')):'';
  var tH=tag?'<span class="email-type-tag" style="background:'+tag.bg+';color:'+tag.c+';border:1px solid '+tag.bd+';">'+tag.i+' '+tag.l+'</span>':'';
  var eid=eH(email.id||'');
  var ab='';
  if(tag&&tag.l==='RFI')ab+='<button class="email-action-btn primary" onclick="event.stopPropagation();deploy(21)">Deploy &#8599;</button>';
  else if(tag&&tag.l==='GRANT')ab+='<button class="email-action-btn primary" onclick="event.stopPropagation();deploy(1)">Grant &#8599;</button>';
  ab+='<button class="email-action-btn" onclick="event.stopPropagation();window.replyToCard(this.closest(\'.email-card-v2\').getAttribute(\'data-eid\'))">Reply</button>';
  ab+='<button class="email-action-btn" onclick="event.stopPropagation();window.archiveCard(this.closest(\'.email-card-v2\').getAttribute(\'data-eid\'))">Archive</button>';
  ab+='<button class="email-action-btn danger" onclick="event.stopPropagation();window.trashCard(this.closest(\'.email-card-v2\').getAttribute(\'data-eid\'))">\u{1F5D1}</button>';
  var bg=gAC(sn),fc=bg.indexOf('aaff3e')>-1?'#1a3300':'#fff';
  var ed=JSON.stringify({id:email.id,from:email.from,subject:email.subject,snippet:email.snippet,date:email.date});
  var div=document.createElement('div');
  div.className='email-card-v2'+tc;
  div.setAttribute('data-eid',eid);
  div.setAttribute('data-email',ed);
  div.style.cursor='pointer';
  div.onclick=function(e){if(!e.target.closest('button'))window.openEmailDetail(JSON.parse(this.getAttribute('data-email')));};
  div.innerHTML='<div class="email-card-top">'
    +'<div class="email-avatar-v2" style="background:'+bg+';color:'+fc+'">'+gIn(sn)+'</div>'
    +'<div class="email-sender-block"><div class="email-sender-name">'+eH(sn)+'</div><div class="email-sender-addr">'+eH(sA)+'</div></div>'
    +'<div class="email-meta-right"><span class="email-time">'+ts+'</span>'+tH+'</div>'
    +'</div>'
    +'<div class="email-subject">'+eH(email.subject||'(no subject)')+'</div>'
    +'<div class="email-preview">'+eH(email.snippet||'')+'</div>'
    +'<div class="email-footer-actions">'+ab+'</div>';
  return div.outerHTML;
}

function addCalTab(){
  var nav=document.querySelector('.nav-tabs');if(!nav||document.getElementById('navCal'))return;
  var btn=document.createElement('button');btn.id='navCal';btn.className='nav-tab';btn.textContent='Calendar';
  btn.onclick=showCalView;nav.appendChild(btn);
}

function showCalView(){
  document.querySelectorAll('[id$="-tab"]').forEach(function(t){t.style.display='none';});
  var cv=document.getElementById('esqCalView');
  if(!cv){
    cv=document.createElement('div');cv.id='esqCalView';
    cv.style.cssText='padding:20px 16px 100px;overflow-y:auto;flex:1;';
    var h='<div style="font-family:Barlow,sans-serif;font-size:11px;font-weight:800;color:#4a5568;text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px;">\u{1F4C5} Today</div>';
    var te=document.getElementById('calendar-today');if(te)h+=te.innerHTML;
    h+='<div style="font-family:Barlow,sans-serif;font-size:11px;font-weight:800;color:#4a5568;text-transform:uppercase;letter-spacing:.1em;margin:20px 0 12px;">\u{1F4C6} Coming Up</div>';
    var we=document.getElementById('calendar-week');if(we)h+=we.innerHTML;
    cv.innerHTML=h;
    var shell=document.querySelector('.shell');if(shell)shell.appendChild(cv);
  }
  cv.style.display='block';
  document.querySelectorAll('.nav-tab').forEach(function(t){t.classList.remove('active');});
  var nc=document.getElementById('navCal');if(nc)nc.classList.add('active');
}

function install(){
  if(typeof window.showEmailList!=='function'||typeof window.escHtml!=='function'){setTimeout(install,300);return;}
  window.showEmailList=function(emails){
    window._lastEmails=emails;
    var list=document.getElementById('email-list');if(!list)return;
    if(!emails||!emails.length){
      var mode=window._inboxMode||'unread';
      var emptyIcon=mode==='sent'?'\u{1F4E4}':mode==='read'?'✅':'\u{1F4EB}';
      var emptyMsg=mode==='sent'?'No sent emails':mode==='read'?'Inbox zero — no read emails':'No unread emails';
      list.innerHTML='<div style="text-align:center;padding:60px;color:#4a5568;"><div style="font-size:32px;">'+emptyIcon+'</div><div style="margin-top:8px;">'+emptyMsg+'</div></div>';
      return;
    }
    var tagged=emails.filter(function(e){var t=getTag(e.from||'',e.subject||'',e.snippet||'');return t&&t.p;});
    var others=emails.filter(function(e){var t=getTag(e.from||'',e.subject||'',e.snippet||'');return!(t&&t.p);});
    list.innerHTML=tagged.concat(others).map(renderCard).join('');
    var lbl=document.getElementById('unread-count-label');if(lbl)lbl.textContent=emails.length+' unread \u00B7 '+tagged.length+' priority';
    var badge=document.getElementById('inbox-badge');if(badge&&emails.length>0){badge.textContent=emails.length;badge.style.display='inline';}
    setTimeout(function(){window.autoPurge();showTB();addCalTab();},600);
  };
  window.renderEmailCard=renderCard;
  // Event delegation for email card clicks
  var emailList = document.getElementById('email-list');
  if(emailList && !emailList._esqClick) {
    emailList._esqClick = true;
    emailList.addEventListener('click', function(e) {
      if(e.target.closest('button')) return;
      var card = e.target.closest('.email-card-v2');
      if(!card) return;
      var data = card.getAttribute('data-email');
      if(data) { try { window.openEmailDetail(JSON.parse(data)); } catch(err){} }
    });
  }
}
install();
setTimeout(addCalTab,2000);
})();
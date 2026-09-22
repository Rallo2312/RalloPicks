(function () {
  const search = document.getElementById('globalPlayerSearch');
  search.type = 'search'; search.setAttribute('aria-label', 'Search players');
  const ufcNav = document.createElement('nav');
  ufcNav.id = 'ufcNav'; ufcNav.className = 'nav app-main-nav'; ufcNav.setAttribute('aria-label','UFC sections');
  ufcNav.innerHTML = '<button class="active" type="button">Fight research</button>';
  document.getElementById('nflNav').after(ufcNav);
  const switchSport = window.setSport, searchPlayers = window.runGlobalSearch;
  function sync() {
    const sport = state.currentSport;
    ufcNav.hidden = sport !== 'UFC';
    search.placeholder = sport === 'UFC' ? 'Search fighters…' : 'Search ' + sport + ' players…';
    search.setAttribute('aria-label', sport === 'UFC' ? 'Search fighters' : 'Search ' + sport + ' players');
    for (const name of ['MLB','NFL','UFC']) {
      const button = document.getElementById('sport' + name);
      button.setAttribute('role','tab'); button.setAttribute('aria-selected',String(sport === name));
    }
  }
  window.setSport = function (name) {switchSport(name);search.value='';document.querySelectorAll('.rp-ufc-fight').forEach(el=>el.hidden=false);document.getElementById('ufcSearchEmpty')?.remove();sync();};
  window.runGlobalSearch = function (query) {
    if (state.currentSport !== 'UFC') return searchPlayers(query);
    const q = String(query || '').trim().toLowerCase();let count=0;
    document.querySelectorAll('.rp-ufc-fight').forEach(el=>{el.hidden=!el.textContent.toLowerCase().includes(q);if(!el.hidden)count++;});
    document.getElementById('ufcSearchEmpty')?.remove();
    if (!count) {const empty=document.createElement('p');empty.id='ufcSearchEmpty';empty.className='ufc-search-empty';empty.textContent='No fighters match your search.';document.getElementById('rpUfcCard').append(empty);}
  };
  search.addEventListener('input',()=>{if(state.currentSport==='UFC')window.runGlobalSearch(search.value);});
  document.querySelector('.sport-switch').addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const sports=['MLB','NFL','UFC'],i=sports.indexOf(state.currentSport);
    const next=event.key==='Home'?0:event.key==='End'?2:(i+(event.key==='ArrowRight'?1:2))%3;
    event.preventDefault();window.setSport(sports[next]);document.getElementById('sport'+sports[next]).focus();
  });
  sync();
})();

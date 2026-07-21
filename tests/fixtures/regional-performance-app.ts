export type RegionalRow = { region: string; planned: number; actual: number };

export const regionalRows: RegionalRow[] = [
  { region: 'North', planned: 100, actual: 80 },
  { region: 'South', planned: 200, actual: 100 },
  { region: 'Central', planned: 100, actual: 65 },
  { region: 'West', planned: 100, actual: 35 },
  { region: 'East', planned: 100, actual: 20 }
];

export const regionalPerformanceHtml = `<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Regional Performance</title>
<style>body{font-family:sans-serif;margin:0}main{padding:1rem;max-width:100%}.table-wrap{overflow-x:auto}table{width:100%;min-width:560px;border-collapse:collapse}th,td{padding:.5rem;text-align:left}button,select{min-height:44px}:focus-visible{outline:3px solid #175cd3}[hidden]{display:none}</style></head><body>
<main><h1>Regional Performance</h1><label>Region<select id="region"><option>All</option><option>North</option><option>South</option><option>Central</option><option>West</option><option>East</option></select></label>
<div role="status" aria-label="Loading regional performance">Loading regional performance…</div><div role="alert" hidden></div><p id="empty" hidden>No regional performance data</p>
<section role="region" aria-label="Average Execution Score"><h2>Average Execution Score</h2><strong data-testid="kpi-value"></strong></section>
<section role="region" aria-label="Regional performance chart"></section><div class="table-wrap"><table aria-label="Regional rankings"><thead><tr><th>Rank</th><th>Region</th><th>Planned</th><th>Actual</th><th><button id="sort">Execution Score</button></th></tr></thead><tbody></tbody></table></div>
<button id="previous" aria-label="Previous page">Previous</button><span id="page"></span><button id="next" aria-label="Next page">Next</button>
<script>
let rows=[],page=1,ascending=false;const size=2;
const score=r=>r.planned===0?0:Number(((r.actual/r.planned)*100).toFixed(2));
function render(){const sorted=[...rows].sort((a,b)=>ascending?score(a)-score(b):score(b)-score(a));const shown=sorted.slice((page-1)*size,page*size);
document.querySelector('tbody').innerHTML=shown.map((r,i)=>'<tr><td>'+((page-1)*size+i+1)+'</td><td>'+r.region+'</td><td>'+r.planned+'</td><td>'+r.actual+'</td><td>'+score(r).toFixed(2)+'%</td></tr>').join('');
const chart=document.querySelector('[aria-label="Regional performance chart"]');chart.innerHTML=shown.map(r=>'<span data-testid="chart-'+r.region+'" data-score="'+score(r)+'">'+score(r).toFixed(2)+'%</span>').join('');
document.querySelector('[aria-label="Average Execution Score"] [data-testid="kpi-value"]').textContent=(shown.reduce((n,r)=>n+score(r),0)/(shown.length||1)).toFixed(2)+'%';
document.querySelector('#empty').hidden=rows.length!==0;document.querySelector('table').hidden=rows.length===0;document.querySelector('#page').textContent='Page '+page;
document.querySelector('#previous').disabled=page===1;document.querySelector('#next').disabled=page*size>=sorted.length}
async function load(){document.querySelector('[role=status]').hidden=false;document.querySelector('[role=alert]').hidden=true;try{const region=document.querySelector('#region').value;
const response=await fetch('/api/regional-performance?region='+encodeURIComponent(region));if(!response.ok)throw new Error('status '+response.status);rows=await response.json();page=1;render()}
catch(e){rows=[];document.querySelector('table').hidden=true;const alert=document.querySelector('[role=alert]');alert.hidden=false;alert.textContent='Unable to load regional performance'}finally{document.querySelector('[role=status]').hidden=true}}
document.querySelector('#region').onchange=load;document.querySelector('#sort').onclick=()=>{ascending=!ascending;render()};document.querySelector('#next').onclick=()=>{page++;render()};document.querySelector('#previous').onclick=()=>{page--;render()};load();
</script></main></body></html>`;

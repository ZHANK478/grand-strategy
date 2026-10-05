/* Locally hosted national flags; historical civil variants for several 1852 states. */
(() => {
 const aliases={
  fr:['франция','французкий алжир','французский алжир','france'],
  gb:['великобритания','британская новая америка','индия(британская)','канада(британская)','united kingdom'],
  ru:['россия','российская империя','russia'],tr:['турция','османская империя','turkey'],
  es:['испания','куба (испанская)','spain'],us:['сша','соединенные штаты америки','соединённые штаты америки','united states'],
  pt:['португалия','portugal'],at:['австрия','австрийская империя'],de:['германия','германская империя'],
  it:['италия','неаполитанское королевство','тоскана'],ir:['иран','персия'],
  be:['бельгия'],nl:['нидерланды','голландия'],se:['швеция'],dk:['дания','шлезвиг гольштейн'],
  ch:['швейцария','швейцарская конфедерация'],gr:['греция'],lu:['люксембург'],
  mx:['мексика','мекика'],af:['афганистан'],ma:['марокко','султанат марокко'],
  eg:['египет','египет(османская империя)'],tn:['тунис','тунис(османская империя)'],
  ca:['канада'],in:['индия'],prussia:['пруссия'],saxony:['саксония'],bavaria:['бавария'],
  hanover:['гановер','ганновер'],wurttemberg:['вюртемберг'],hessen:['гессен'],
  baden:['баден'],sardinia:['сардиния-пемонт','сардиния-пьемонт'], 'papal-states':['папская область']
 };
 const normal=name=>String(name||'').toLowerCase().trim().replace(/^королевство\s+/,'').replace(/\s+/g,' ');
 const codes=new Map();
 Object.entries(aliases).forEach(([code,names])=>names.forEach(name=>codes.set(normal(name),code)));
 window.mobileFlagSource=(name,era)=>{
  let code=codes.get(normal(name));
  if(!code)return null;
  if(era<1918&&code==='at')code='austrian-empire';
  if(era>=1851&&era<1858&&code==='us')code='us-1852';
  return 'assets/flags/'+code+'.svg';
 };
})();

/* Geography is data, never a list of country-specific execution exceptions.
   Scenarios may override maritime.regions, maritime.links, maritime.ports and profile navalSeed. */
'use strict';
const MARITIME_REGIONS=[
 ['channel','Ла-Манш',-2,50],['north','Северное море',3,56],['baltic','Балтийское море',18,57],['biscay','Бискайский залив',-7,45],
 ['iberia','Атлантика у Пиренейского полуострова',-12,36],['gibraltar','Гибралтарский пролив',-5.6,35.9],
 ['medwest','Западное Средиземноморье',5,39],['tyrrhenian','Тирренское море',12,40],['adriatic','Адриатика',16,43],
 ['ionian','Ионическое море',19,36],['aegean','Эгейское море',25,37],['bosporus','Босфор',29,41],
 ['black','Чёрное море',34,43],['levant','Восточное Средиземноморье',32,33],
 ['norwegian','Норвежское море',4,65],['arctic','Баренцево море',35,72],['atlanticnorth','Северная Атлантика',-30,55],
 ['atlanticwest','Атлантика у Северной Америки',-65,38],['caribbean','Карибское море',-75,20],['gulf','Мексиканский залив',-90,25],
 ['atlanticsouth','Южная Атлантика',-25,-15],['brazil','Побережье Бразилии',-40,-20],['westafrica','Западная Африка',-18,12],
 ['cape','Мыс Доброй Надежды',18,-36],['eastafrica','Восточная Африка',45,-15],['red','Красное море',38,20],
 ['arabian','Аравийское море',62,16],['persian','Персидский залив',51,26],['india','Побережье Индии',75,5],['bengal','Бенгальский залив',88,15],
 ['malacca','Малаккский пролив',102,2],['southchina','Южно-Китайское море',114,12],['eastchina','Восточно-Китайское море',125,29],
 ['japan','Японское море',135,39],['pacificnorth','Северная часть Тихого океана',175,40],['pacificeast','Тихоокеанское побережье Америки',-130,35],
 ['pacificsouth','Южная часть Тихого океана',-135,-20],['chile','Побережье Чили',-77,-25],['horn','Мыс Горн',-68,-57],
 ['indianocean','Индийский океан',80,-25],['australiawest','Запад Австралии',112,-25],['australiaeast','Восток Австралии',155,-25],
 ['indonesia','Индонезийские моря',120,-7],['bering','Берингово море',-170,58],['white','Белое море',40,66]
].map(([id,name,x,y])=>({id,name,coordinates:[x,y],...(['bosporus','gibraltar'].includes(id)?{kind:'strait',coastRadiusKm:id==='bosporus'?75:120}:{})}));
const MARITIME_LINKS=[
 ['channel','north'],['channel','biscay'],['north','baltic'],['north','norwegian'],['biscay','iberia'],['iberia','gibraltar'],
 ['gibraltar','medwest'],['medwest','tyrrhenian'],['tyrrhenian','ionian'],['ionian','adriatic'],['ionian','aegean'],['aegean','bosporus'],['bosporus','black'],
 ['ionian','levant'],['aegean','levant'],['norwegian','arctic'],['arctic','white'],['norwegian','atlanticnorth'],['biscay','atlanticnorth'],
 ['atlanticnorth','atlanticwest'],['atlanticwest','caribbean'],['caribbean','gulf'],['iberia','westafrica'],['westafrica','atlanticsouth'],
 ['atlanticsouth','brazil'],['brazil','caribbean'],['atlanticsouth','cape'],['cape','eastafrica'],['cape','indianocean'],
 ['eastafrica','arabian'],['arabian','red'],['arabian','persian'],['arabian','india'],['india','bengal'],['india','indianocean'],
 ['bengal','malacca'],['malacca','southchina'],['malacca','indonesia'],['southchina','eastchina'],['eastchina','japan'],
 ['japan','pacificnorth'],['pacificnorth','bering'],['pacificnorth','pacificeast'],['pacificeast','pacificsouth'],['pacificsouth','chile'],
 ['chile','horn'],['horn','brazil'],['indianocean','australiawest'],['australiawest','indonesia'],['indonesia','australiaeast'],
 ['australiaeast','pacificsouth'],['indonesia','southchina']
];
/* Geographic places: ownership is resolved from the scenario polygons, never from a hardcoded country. */
const MARITIME_PORTS=[
 ['Брест',-4.49,48.39,'channel',3,2],['Тулон',5.93,43.12,'medwest',3,2],['Марсель',5.37,43.3,'medwest',3,1],
 ['Бордо',-.58,44.84,'biscay',2,1],['Гавр',.1,49.49,'channel',2,1],['Портсмут',-1.1,50.8,'channel',4,3],
 ['Лондон',.05,51.5,'north',4,2],['Ливерпуль',-3,53.4,'atlanticnorth',3,2],['Гибралтар',-5.35,36.14,'gibraltar',2,1],
 ['Гамбург',10,53.55,'north',3,1],['Киль',10.12,54.32,'baltic',2,1],['Данциг',18.65,54.35,'baltic',2,1],
 ['Копенгаген',12.57,55.68,'baltic',2,2],['Стокгольм',18.07,59.33,'baltic',2,1],['Кронштадт',29.77,60,'baltic',3,2],
 ['Одесса',30.72,46.48,'black',2,1],['Севастополь',33.52,44.6,'black',3,2],['Константинополь',28.97,41,'bosporus',3,2],
 ['Смирна',27.14,38.42,'aegean',2,1],['Пирей',23.64,37.94,'aegean',2,1],['Триест',13.77,45.65,'adriatic',2,1],
 ['Венеция',12.33,45.44,'adriatic',2,1],['Генуя',8.93,44.41,'medwest',2,1],['Неаполь',14.27,40.85,'tyrrhenian',2,1],
 ['Палермо',13.36,38.12,'tyrrhenian',2,1],['Барселона',2.17,41.38,'medwest',2,1],['Кадис',-6.29,36.53,'iberia',2,1],
 ['Лиссабон',-9.14,38.72,'iberia',3,1],['Амстердам',4.9,52.37,'north',3,2],['Антверпен',4.4,51.22,'north',2,1],
 ['Алжир',3.06,36.75,'medwest',2,1],['Александрия',29.9,31.2,'levant',2,1],['Бейрут',35.5,33.9,'levant',1,0],
 ['Бомбей',72.88,18.94,'arabian',3,1],['Калькутта',88.36,22.57,'bengal',3,1],['Сингапур',103.85,1.29,'malacca',2,1],
 ['Гонконг',114.17,22.3,'southchina',2,1],['Шанхай',121.47,31.23,'eastchina',2,1],['Нагасаки',129.87,32.75,'eastchina',1,0],
 ['Йокогама',139.65,35.45,'pacificnorth',1,0],['Сидней',151.2,-33.86,'australiaeast',2,1],
 ['Кейптаун',18.42,-33.93,'cape',2,1],['Нью-Йорк',-74,40.7,'atlanticwest',4,2],['Бостон',-71.06,42.36,'atlanticwest',3,2],
 ['Новый Орлеан',-90.07,29.95,'gulf',2,1],['Сан-Франциско',-122.42,37.77,'pacificeast',2,1],['Гавана',-82.37,23.11,'caribbean',2,1],
 ['Рио-де-Жанейро',-43.2,-22.9,'brazil',2,1],['Буэнос-Айрес',-58.38,-34.6,'brazil',2,1],['Вальпараисо',-71.63,-33.04,'chile',2,1]
].map(([name,x,y,region,level,shipyard])=>({name,coordinates:[x,y],region,level,shipyard}));
const MARITIME_GOODS={food:{name:'Продовольствие',sector:'agriculture',share:.35},raw:{name:'Сырьё',sector:'resources',share:.2},manufactured:{name:'Промышленные товары',sector:'industry',share:.35},military:{name:'Военные материалы',sector:'industry',share:.1}};
const MARITIME_SHIPS={heavy:{name:'Тяжёлый боевой',cost:24,upkeep:.6,days:540,power:8,crew:700},light:{name:'Лёгкий боевой',cost:8,upkeep:.18,days:270,power:2,crew:180},transport:{name:'Транспорт',cost:5,upkeep:.06,days:180,power:.15,crew:70,capacity:1500}};

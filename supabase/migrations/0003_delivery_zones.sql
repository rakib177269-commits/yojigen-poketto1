-- 0003 Delivery zones. Fees and keywords are editable later from the admin.
-- Matching order (match_priority): outskirts (10) -> named districts outside
-- Dhaka (20) -> Dhaka city areas and the word "Dhaka" (30) -> default.
-- So "সাভার, ঢাকা" is outskirts, "Tangail, Dhaka division" is outside Dhaka,
-- and "House 5, Road 2, Dhanmondi" is inside Dhaka.

insert into public.delivery_zones (code, name, fee, eta_text, match_priority, is_default, keywords) values
('dhaka_outskirts', 'Dhaka outskirts', 100, '2–3 days', 10, false, array[
  'savar', 'saver', 'ashulia', 'asulia', 'keraniganj', 'keranigonj', 'gazipur', 'gajipur', 'tongi',
  'narayanganj', 'narayangonj', 'narayangang', 'demra',
  'সাভার', 'আশুলিয়া', 'আশুলিযা', 'কেরানীগঞ্জ', 'গাজীপুর', 'টঙ্গী', 'নারায়ণগঞ্জ', 'ডেমরা'
]),
('outside_dhaka', 'Outside Dhaka', 130, 'Within 5 days', 20, true, array[
  'chittagong', 'chattogram', 'ctg', 'sylhet', 'khulna', 'rajshahi', 'rangpur', 'barisal', 'barishal',
  'mymensingh', 'comilla', 'cumilla', 'bogura', 'bogra', 'jessore', 'jashore', 'noakhali', 'feni',
  'cox''s bazar', 'coxs bazar', 'cox bazar', 'tangail', 'faridpur', 'pabna', 'dinajpur', 'kushtia',
  'narsingdi', 'munshiganj', 'manikganj', 'kishoreganj', 'brahmanbaria', 'chandpur', 'lakshmipur',
  'laxmipur', 'jamalpur', 'sherpur', 'netrokona', 'gopalganj', 'madaripur', 'shariatpur', 'rajbari',
  'habiganj', 'moulvibazar', 'maulvibazar', 'sunamganj', 'bagerhat', 'satkhira', 'jhenaidah',
  'chuadanga', 'meherpur', 'narail', 'magura', 'barguna', 'patuakhali', 'pirojpur', 'jhalokati',
  'jhalakathi', 'bhola', 'thakurgaon', 'panchagarh', 'nilphamari', 'lalmonirhat', 'kurigram',
  'gaibandha', 'joypurhat', 'naogaon', 'natore', 'chapainawabganj', 'chapai nawabganj', 'sirajganj',
  'bandarban', 'rangamati', 'khagrachari', 'khagrachhari',
  'চট্টগ্রাম', 'সিলেট', 'খুলনা', 'রাজশাহী', 'রংপুর', 'বরিশাল', 'ময়মনসিংহ', 'কুমিল্লা', 'বগুড়া',
  'যশোর', 'নোয়াখালী', 'ফেনী', 'কক্সবাজার', 'টাঙ্গাইল', 'ফরিদপুর', 'পাবনা', 'দিনাজপুর', 'কুষ্টিয়া',
  'নরসিংদী', 'মুন্সীগঞ্জ', 'মুন্সিগঞ্জ', 'মানিকগঞ্জ', 'কিশোরগঞ্জ', 'ব্রাহ্মণবাড়িয়া', 'চাঁদপুর',
  'লক্ষ্মীপুর', 'জামালপুর', 'শেরপুর', 'নেত্রকোনা', 'গোপালগঞ্জ', 'মাদারীপুর', 'শরীয়তপুর',
  'রাজবাড়ী', 'হবিগঞ্জ', 'মৌলভীবাজার', 'সুনামগঞ্জ', 'বাগেরহাট', 'সাতক্ষীরা', 'ঝিনাইদহ',
  'চুয়াডাঙ্গা', 'মেহেরপুর', 'নড়াইল', 'মাগুরা', 'বরগুনা', 'পটুয়াখালী', 'পিরোজপুর', 'ঝালকাঠি',
  'ভোলা', 'ঠাকুরগাঁও', 'পঞ্চগড়', 'নীলফামারী', 'লালমনিরহাট', 'কুড়িগ্রাম', 'গাইবান্ধা',
  'জয়পুরহাট', 'নওগাঁ', 'নাটোর', 'চাঁপাইনবাবগঞ্জ', 'সিরাজগঞ্জ', 'বান্দরবান', 'রাঙ্গামাটি',
  'রাঙামাটি', 'খাগড়াছড়ি'
]),
('dhaka_inside', 'Inside Dhaka', 70, 'Within 2 days', 30, false, array[
  'dhanmondi', 'dhanmondhi', 'mirpur', 'gulshan', 'banani', 'uttara', 'mohammadpur', 'mohammedpur',
  'motijheel', 'badda', 'rampura', 'khilgaon', 'malibagh', 'mogbazar', 'moghbazar', 'tejgaon',
  'farmgate', 'shyamoli', 'shamoli', 'adabor', 'lalbagh', 'old dhaka', 'jatrabari', 'wari',
  'bashundhara', 'baridhara', 'cantonment', 'khilkhet', 'kafrul', 'pallabi', 'mohakhali',
  'shahbagh', 'paltan', 'azimpur', 'hazaribagh', 'kamrangirchar', 'sabujbagh', 'basabo', 'mugda',
  'shantinagar', 'kalabagan', 'new market', 'elephant road', 'banasree', 'banashree', 'aftabnagar',
  'dakshinkhan', 'uttarkhan', 'turag', 'gabtoli', 'kallyanpur', 'kalyanpur', 'agargaon', 'nikunja',
  'shewrapara', 'kazipara', 'mohammadia', 'segunbagicha', 'gendaria', 'sutrapur', 'kotwali',
  'chawkbazar', 'bangshal', 'dhaka',
  'ধানমন্ডি', 'মিরপুর', 'গুলশান', 'বনানী', 'উত্তরা', 'মোহাম্মদপুর', 'মতিঝিল', 'বাড্ডা', 'রামপুরা',
  'খিলগাঁও', 'মালিবাগ', 'মগবাজার', 'তেজগাঁও', 'ফার্মগেট', 'শ্যামলী', 'আদাবর', 'লালবাগ',
  'পুরান ঢাকা', 'যাত্রাবাড়ী', 'ওয়ারী', 'বসুন্ধরা', 'বারিধারা', 'ক্যান্টনমেন্ট', 'খিলক্ষেত', 'কাফরুল',
  'পল্লবী', 'মহাখালী', 'শাহবাগ', 'পল্টন', 'আজিমপুর', 'হাজারীবাগ', 'কামরাঙ্গীরচর', 'সবুজবাগ',
  'বাসাবো', 'মুগদা', 'শান্তিনগর', 'কলাবাগান', 'নিউ মার্কেট', 'বনশ্রী', 'আফতাবনগর', 'দক্ষিণখান',
  'উত্তরখান', 'তুরাগ', 'গাবতলী', 'কল্যাণপুর', 'আগারগাঁও', 'নিকুঞ্জ', 'শেওড়াপাড়া', 'কাজীপাড়া',
  'গেন্ডারিয়া', 'সূত্রাপুর', 'কোতোয়ালী', 'চকবাজার', 'বংশাল', 'ঢাকা'
]);

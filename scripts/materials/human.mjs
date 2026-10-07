// 人の朗読の素材（LibriVox「The Aesop for Children」の録音1つ = 寓話4話）
// 本文の見出しは Project Gutenberg 版（#19994）の見出しのとおり
const base = 'https://www.archive.org/download/aesopforchildren_1308_librivox/'
const sec = (section, reader, headings, questions) => ({
  section, reader, headings, questions,
  file: `theaesopforchildren_${String(section).padStart(2, '0')}_aesop_64kb.mp3`,
  url: `${base}theaesopforchildren_${String(section).padStart(2, '0')}_aesop_64kb.mp3`,
})

export const HUMAN_SECTIONS = [
  sec(1, 'Bob Neufeld', ['THE WOLF AND THE KID', 'THE TORTOISE AND THE DUCKS', 'THE YOUNG CRAB AND HIS MOTHER', 'THE FROGS AND THE OX'], [
    { q: 'Why did the young Crab fail to learn to walk forward?', options: ['His mother could only walk sideways too', 'He did not want to learn', 'The ground was too wet'], answer: 0 },
    { q: 'What happened to the old Frog in the end?', options: ['She ran away from the Ox', 'She puffed herself up until she burst', 'She became bigger than the Ox'], answer: 1 },
  ]),
  sec(2, 'Halle Kill', ['THE DOG, THE COCK, AND THE FOX', 'BELLING THE CAT', 'THE EAGLE AND THE JACKDAW', 'THE BOY AND THE FILBERTS'], [
    { q: 'What plan did the young Mouse suggest?', options: ['To move to another house', 'To hang a bell on the Cat', 'To fight the Cat together'], answer: 1 },
    { q: 'Why could the Boy not get his hand out of the pitcher?', options: ['The pitcher was too hot', 'He took too many filberts at once', 'His mother held the pitcher'], answer: 1 },
  ]),
  sec(4, 'Katalina Watt', ['THE BUNDLE OF STICKS', 'THE WOLF AND THE CRANE', 'THE ASS AND HIS DRIVER', 'THE OXEN AND THE WHEELS'], [
    { q: 'What did the Father want his Sons to learn from the sticks?', options: ['That working alone is faster', 'That they are strong when they stay together', 'That sticks are useful'], answer: 1 },
    { q: 'Why were the Oxen angry with the Wheels?', options: ['The Wheels complained although their work was light', 'The Wheels broke in the mud', 'The Wheels went too fast'], answer: 0 },
  ]),
  sec(8, 'Jill Engle', ['THE RAT AND THE ELEPHANT', 'THE BOYS AND THE FROGS', 'THE CROW AND THE PITCHER', 'THE ANTS AND THE GRASSHOPPER'], [
    { q: 'How did the Crow get the water?', options: ['He broke the pitcher', 'He dropped pebbles into it', 'He asked another bird for help'], answer: 1 },
    { q: 'What was the Grasshopper doing all summer?', options: ['Storing food', 'Making music', 'Sleeping'], answer: 1 },
  ]),
  sec(13, 'Lee Smalley', ['THE TRAVELERS AND THE SEA', 'THE WOLF AND THE LION', 'THE STAG AND HIS REFLECTION', 'THE PEACOCK'], [
    { q: 'What did the Travelers find on the beach in the end?', options: ['A chest of gold', 'A fishing boat', 'A water-soaked log'], answer: 2 },
    { q: 'Why did the Panther catch the Stag?', options: ['His antlers caught in the branches', 'His legs were too weak', 'He stopped to drink water'], answer: 0 },
  ]),
  sec(20, 'lewildesen', ['THE FARMER AND THE CRANES', 'THE FARMER AND HIS SONS', 'THE TWO POTS', 'THE GOOSE AND THE GOLDEN EGG'], [
    { q: 'What did the Farmer tell his sons was hidden on the farm?', options: ['A rich treasure', 'A secret map', 'Golden eggs'], answer: 0 },
    { q: 'Why did the Countryman kill the Goose?', options: ['The Goose was sick', 'He wanted all the golden eggs at once', 'The Goose stopped laying eggs'], answer: 1 },
  ]),
]

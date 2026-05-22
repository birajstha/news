import sharp from 'sharp';

const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="80" fill="#060d14"/>
  <rect x="60" y="60" width="392" height="392" rx="48" fill="#0f1923" stroke="#3a7bd5" stroke-width="10"/>
  <rect x="100" y="140" width="312" height="30" rx="15" fill="#3a7bd5"/>
  <rect x="100" y="195" width="250" height="18" rx="9" fill="#7a8fa8"/>
  <rect x="100" y="228" width="290" height="18" rx="9" fill="#7a8fa8"/>
  <rect x="100" y="261" width="210" height="18" rx="9" fill="#7a8fa8"/>
  <rect x="100" y="310" width="140" height="14" rx="7" fill="#3a7bd5" opacity="0.6"/>
  <rect x="260" y="310" width="150" height="14" rx="7" fill="#3a7bd5" opacity="0.6"/>
</svg>`);

await Promise.all([
  sharp(svg).resize(192).png().toFile('public/icon-192.png'),
  sharp(svg).resize(512).png().toFile('public/icon-512.png'),
]);
console.log('icons created');

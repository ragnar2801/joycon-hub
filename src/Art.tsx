export function PlaneArt({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 720 440" fill="none" aria-hidden="true">
    <defs><linearGradient id="wing" x1="230" y1="100" x2="430" y2="360" gradientUnits="userSpaceOnUse"><stop stopColor="#fff8df"/><stop offset="1" stopColor="#d4d6bb"/></linearGradient><linearGradient id="body" x1="190" y1="155" x2="530" y2="280" gradientUnits="userSpaceOnUse"><stop stopColor="#fffcdf"/><stop offset="1" stopColor="#dddcc0"/></linearGradient></defs>
    <circle cx="422" cy="225" r="155" stroke="#b4d9bc" strokeOpacity=".2"/>
    <circle cx="422" cy="225" r="115" stroke="#b4d9bc" strokeOpacity=".16" strokeDasharray="4 8"/>
    <path d="M70 305c70 70 171 40 193-39S141 166 133 247s181 112 410-104" stroke="#d7efae" strokeOpacity=".45" strokeWidth="2" strokeDasharray="5 8"/>
    <ellipse cx="397" cy="367" rx="169" ry="19" fill="#102e2b" opacity=".35"/>
    <g transform="rotate(-13 390 215)">
      <path d="m375 220 32-144 56-24-17 180Z" fill="url(#wing)"/>
      <path d="m407 76 56-24-5 36-59 23Z" fill="#ee8a5c"/>
      <path d="m504 237 29-89 36-5-13 104Z" fill="#ee8a5c"/>
      <path d="M238 231c7-40 54-59 108-40l223 50c18 5 9 25-12 28l-227-5c-52-1-92-11-92-33Z" fill="url(#body)"/>
      <path d="m332 213 46-115 18-9-22 138Z" fill="#d2d9ba"/>
      <path d="m351 232 42 124 78 21-54-134Z" fill="url(#wing)"/>
      <path d="m382 326 11 30 78 21-16-33Z" fill="#ee8a5c"/>
      <path d="m510 245 46 65 45 7-32-62Z" fill="#ee8a5c"/>
      <path d="M306 193c30-19 60-13 79 16l-66 0Z" fill="#244d47"/>
      <path d="m335 188 4 20" stroke="#a6c1ac" strokeWidth="3"/>
      <path d="M250 222c-11 15-8 27 7 32l17-30Z" fill="#ee8a5c"/>
      <ellipse cx="244" cy="233" rx="5" ry="43" transform="rotate(-15 244 233)" fill="#aec7a1" opacity=".65"/>
      <path d="m242 202 2 58" stroke="#163d36" strokeWidth="4" strokeLinecap="round"/>
      <circle cx="246" cy="231" r="7" fill="#234b40"/>
      <path d="m400 249 32 4" stroke="#a6ad91" strokeWidth="2"/>
    </g>
    <path d="M544 84h25m-12-12v25M197 111h15m-7-7v15" stroke="#d7efae" strokeOpacity=".5" strokeWidth="2"/>
    <g fill="#c7d7b3" opacity=".1"><ellipse cx="580" cy="344" rx="57" ry="15"/><ellipse cx="626" cy="332" rx="41" ry="22"/><ellipse cx="655" cy="347" rx="50" ry="14"/></g>
  </svg>;
}

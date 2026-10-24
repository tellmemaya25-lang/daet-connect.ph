/** Flat drawing of the Bagasbas coast: sun, islands and three bands of surf. Decorative only. */
export function CoastScene({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 520" role="img" aria-label="Drawing of the sun over the sea off Bagasbas beach" className={className} preserveAspectRatio="xMidYMid slice">
      <rect width="600" height="520" className="fill-blue-600" />
      <circle cx="410" cy="190" r="86" className="fill-yellow-500" />
      <path d="M0 300 L90 250 L150 285 L230 235 L320 300 Z" className="fill-blue-700" />
      <path d="M330 300 L420 262 L480 290 L600 245 L600 300 Z" className="fill-blue-700" />
      <rect y="300" width="600" height="220" className="fill-blue-800" />
      <path d="M0 340 Q50 315 100 340 T200 340 T300 340 T400 340 T500 340 T600 340 V380 H0 Z" className="fill-blue-500" />
      <path d="M0 385 Q75 355 150 385 T300 385 T450 385 T600 385 V430 H0 Z" className="fill-sky-300" />
      <path d="M0 435 Q100 400 200 435 T400 435 T600 435 V520 H0 Z" className="fill-white" />
      <path d="M0 490 Q150 465 300 490 T600 490 V520 H0 Z" className="fill-slate-100" />
    </svg>
  );
}

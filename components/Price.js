import { formatTaka, discountPercent } from '../lib/format.js';

export default function Price({ price, compareAt, showOff = false }) {
  const off = discountPercent(price, compareAt);
  return (
    <div className="price">
      <span className="now">{formatTaka(price)}</span>
      {off > 0 && (
        <>
          <s className="was"><span className="sr-only">Was </span>{formatTaka(compareAt)}</s>
          {showOff && <span className="off">Save {off}%</span>}
        </>
      )}
    </div>
  );
}

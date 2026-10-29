'use client';
import Link from 'next/link';
import { useRef } from 'react';
import { useStore } from './StoreProvider.js';
import { BagIcon, CloseIcon, HeartIcon, MenuIcon, SearchIcon } from './Icons.js';

function Wordmark() {
  return (
    <Link href="/" className="wordmark" aria-label="Yojigen Poketto home">
      <span className="wordmark-main">Yojigen Poketto</span>
      <span className="wordmark-sub" aria-hidden="true">Bangladesh</span>
    </Link>
  );
}

export default function HeaderClient({ categories }) {
  const { cartCount, wishlist, openCart, ready } = useStore();
  const menu = useRef(null);
  const closeMenu = () => menu.current?.close();

  return (
    <header className="site-header">
      <div className="container header-inner">
        <div className="header-left">
          <button type="button" className="icon-btn" aria-label="Open menu" onClick={() => menu.current?.showModal()}>
            <MenuIcon />
          </button>
        </div>
        <Wordmark />
        <nav className="desktop-nav" aria-label="Main">
          <Link href="/shop">Shop all</Link>
          {categories.map((c) => <Link key={c.slug} href={`/shop/${c.slug}`}>{c.name}</Link>)}
          <Link href="/track">Track order</Link>
        </nav>
        <div className="header-right">
          <Link href="/shop#search" className="icon-btn" aria-label="Search products"><SearchIcon /></Link>
          <Link href="/wishlist" className="icon-btn" aria-label={`Wishlist (${ready ? wishlist.length : 0} items)`}>
            <HeartIcon />
            {ready && wishlist.length > 0 && <span className="badge-count" aria-hidden="true">{wishlist.length}</span>}
          </Link>
          <button type="button" className="icon-btn" aria-label={`Open cart (${ready ? cartCount : 0} items)`} onClick={openCart}>
            <BagIcon />
            {ready && cartCount > 0 && <span className="badge-count" aria-hidden="true">{cartCount}</span>}
          </button>
        </div>
      </div>

      <dialog ref={menu} className="drawer left" aria-label="Menu" onClick={(e) => { if (e.target === e.currentTarget) closeMenu(); }}>
        <div className="drawer-inner">
          <div className="drawer-head">
            <Wordmark />
            <button type="button" className="icon-btn" aria-label="Close menu" onClick={closeMenu}><CloseIcon /></button>
          </div>
          <nav className="drawer-body mobile-nav" aria-label="Mobile" onClick={(e) => { if (e.target.closest('a')) closeMenu(); }}>
            <Link href="/shop">Shop all</Link>
            {categories.map((c) => <Link key={c.slug} href={`/shop/${c.slug}`}>{c.name}</Link>)}
            <Link href="/wishlist">Wishlist</Link>
            <Link href="/track">Track your order</Link>
            <Link href="/shipping">Delivery &amp; fees</Link>
            <Link href="/about">About us</Link>
          </nav>
        </div>
      </dialog>
    </header>
  );
}

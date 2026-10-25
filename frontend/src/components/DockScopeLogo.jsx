import React from 'react';

const DockScopeLogo = ({ size = 56 }) => (
  <svg
    aria-hidden="true"
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="64" height="64" rx="18" fill="#102A43" />
    <path d="M13 20.5 25 14l12 6.5-12 6.5-12-6.5Z" fill="#35B7A4" />
    <path d="M13 23.5 24 29v12l-11-5.5v-12Z" fill="#168C91" />
    <path d="M37 23.5 26 29v12l11-5.5v-12Z" fill="#0F6B78" />
    <path d="m27 40 9-4.5v6L27 46v-6Z" fill="#35B7A4" />
    <circle cx="40" cy="34" r="11" fill="#102A43" stroke="#F4F8FB" strokeWidth="4" />
    <path d="m48 42 7 7" stroke="#F4F8FB" strokeWidth="5" strokeLinecap="round" />
    <path
      d="M36 34.5 39 37l5-6"
      stroke="#74E0B5"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default DockScopeLogo;

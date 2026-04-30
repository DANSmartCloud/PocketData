import styles from "./Logo.module.css";

interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 28, className = "" }: LogoProps) {
  return (
    <svg
      className={`${styles.logo} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 174.55 182.43"
      xmlns="http://www.w3.org/2000/svg"
    >
      <polyline
        className={styles.stroke}
        points="158.13 60.75 85.21 102.87 43.09 29.95"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="10"
      />
      <path
        className={styles.stroke}
        d="M59.75,17.64C35.13,26.41,15.09,46.72,7.82,73.88c-11.75,43.88,14.3,88.98,58.19,100.73,43.88,11.75,88.98-14.3,100.73-58.19,7.46-27.85-.33-56.18-18.22-76.17"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="10"
      />
      <line
        className={styles.stroke}
        x1="80.99"
        y1="48.05"
        x2="96.25"
        y2="74.36"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="10"
      />
      <line
        className={styles.stroke}
        x1="78.47"
        y1="5"
        x2="113.04"
        y2="64.62"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="10"
      />
      <line
        className={styles.stroke}
        x1="104.06"
        y1="8.32"
        x2="130.76"
        y2="54.35"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="10"
      />
    </svg>
  );
}

/**
 * Brand lockup. The approved MCB logo is a transparent PNG that reads on
 * both light and dark grounds, so no light/dark variant is needed.
 */
export default function Logo({ className = "h-16" }: { className?: string }) {
  return (
    <img
      src="/images/brand/MCB-Logo-Final.png"
      alt="My Custom Beats"
      className={`${className} w-auto object-contain`}
    />
  );
}

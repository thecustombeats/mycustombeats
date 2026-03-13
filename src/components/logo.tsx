export default function Logo({ variant = "dark" }) {
  const logoSrc =
    variant === "light" ? "/logo-light.png" : "/logo-dark.png";

  return (
    <img
      src={logoSrc}
      alt="My Custom Beats"
      className="h-16"
    />
  );
}
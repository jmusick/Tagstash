// Keep the original artwork as the source; serve smaller versions at display size.
export default function Logo({ src, alt = 'Tagstash', ...props }) {
  const base = src.replace(/\.png$/, '')
  return (
    <picture className="logo-picture">
      <source srcSet={`${base}.webp 255w, ${base}-large.webp 560w`} sizes={props.className === 'auth-title-logo' ? '280px' : '80px'} type="image/webp" />
      <img src={`${base}-small.png`} alt={alt} width={560} height={440} {...props} />
    </picture>
  )
}

import { THEMES } from './themes';
export function ThemesPage() {
  return (
    <>
      <p className="intro">
        Six directions that fit a compact 3v3 map. Each maps onto the sample layout: two sites, CT
        spawn between them, a long flank, mid, and tunnels.
      </p>
      <div className="themes">
        {THEMES.map((theme) => (
          <article className="theme" key={theme.name}>
            <div className="sw">
              {theme.colors.map((color) => (
                <span key={color} style={{ background: color }} />
              ))}
            </div>
            <div className="body">
              <h3>{theme.name}</h3>
              <p className="pitch">{theme.pitch}</p>
              <dl>
                <dt>Materials</dt>
                <dd>{theme.materials}</dd>
                <dt>Props</dt>
                <dd>{theme.props}</dd>
                <dt>Layout</dt>
                <dd>{theme.layout}</dd>
                <dt>Why</dt>
                <dd>{theme.fit}</dd>
              </dl>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

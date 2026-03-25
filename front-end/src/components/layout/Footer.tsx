import { Mail, MapPin, Twitter, Linkedin, Github } from 'lucide-react'

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface mt-auto">
      <div className="px-8 py-6">
        <div className="flex flex-col md:flex-row justify-between gap-6">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: 'var(--accent)' }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M5 1v8M1 5h8" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </div>
              <span className="font-display font-bold text-text-primary text-sm">LifeLink</span>
            </div>
            <p className="text-xs text-text-muted max-w-xs leading-relaxed">
              National Emergency Response &amp; Dispatch Coordination Platform.
              Connecting citizens to critical services in real time.
            </p>
          </div>

          {/* Contact */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">Contact</p>
            <a href="mailto:ops@commandcore.gh" className="flex items-center gap-2 text-xs text-text-muted hover:text-text-primary transition-colors">
              <Mail size={12} />
              ops@commandcore.gh
            </a>
            <div className="flex items-start gap-2 text-xs text-text-muted">
              <MapPin size={12} className="mt-0.5 flex-shrink-0" />
              <span>Command Core HQ, Independence Ave,<br />Accra, Ghana</span>
            </div>
          </div>

          {/* Social */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">Connect</p>
            <div className="flex gap-3">
              <a href="https://twitter.com/commandcoregh" target="_blank" rel="noreferrer"
                className="text-text-muted hover:text-text-primary transition-colors">
                <Twitter size={15} />
              </a>
              <a href="https://linkedin.com/company/commandcore" target="_blank" rel="noreferrer"
                className="text-text-muted hover:text-text-primary transition-colors">
                <Linkedin size={15} />
              </a>
              <a href="https://github.com/commandcore" target="_blank" rel="noreferrer"
                className="text-text-muted hover:text-text-primary transition-colors">
                <Github size={15} />
              </a>
            </div>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-border-subtle flex flex-col sm:flex-row justify-between items-center gap-2">
          <p className="text-[11px] text-text-muted">
            &copy; {new Date().getFullYear()} Command Core. All rights reserved.
          </p>
          <p className="text-[11px] text-text-muted">
            LifeLink v1.0 &middot; CPEN 421 &middot; University of Ghana
          </p>
        </div>
      </div>
    </footer>
  )
}

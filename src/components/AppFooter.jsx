function AppFooter({ children }) {
  return (
    <footer className="app-footer">
      <span className="footer-copyright">&copy; {new Date().getFullYear()} Tagstash</span>
      {children}
    </footer>
  )
}

export default AppFooter

function AppFooter({ children }) {
  return (
    <footer className="app-footer">
      <span className="footer-copyright">
        &copy; {new Date().getFullYear()}{' '}
        <a href="https://stonedragonmedia.com/" target="_blank" rel="noopener noreferrer">
          Stone Dragon Media LLC
        </a>
      </span>
      {children}
    </footer>
  )
}

export default AppFooter

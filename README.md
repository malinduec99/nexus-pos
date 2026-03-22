<<<<<<< HEAD
# nexus-pos-system
=======
# MEC Book Shop ERP - Management & Deployment

## 🚀 Critical Deployment Rule
Any change made to this codebase **MUST** be followed by running the Master Sync script. This ensures Git, Firebase, and GitHub Updates are all synchronized.

### Command:
```powershell
.\MASTER_SYNC.bat
```

## 🛠 Features
- **Hybrid Hosting**: Web app is on Firebase (Spark Plan), Desktop updates are on GitHub Releases (Free).
- **ERP Modules**: HRM, Accounting, IT Logs, CRM, and Supply Chain Management.
- **RBAC**: Role-Based Access Control managed via `src/admin.js`.

## 📦 Publishing Updates
When you change the version in `package.json`, run `MASTER_SYNC.bat` and select `y` when prompted to publish to GitHub.

---
*Managed by MEC Global Solutions*
>>>>>>> f1815e8 (Initial commit from Antigravity)

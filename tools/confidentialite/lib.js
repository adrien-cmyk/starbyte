// Relevé commun aux tests de confidentialité : statut par contrôle, rapport Markdown daté, code de sortie.
// ok = conforme ; ko = écart à corriger (le test échoue) ; alerte = point connu à suivre (le test passe).
// Le dépôt est public : ne jamais y écrire de donnée de joueur, de clé ni de cookie complet.
const fs = require('fs');
const path = require('path');

function report(titre) {
  const rows = [];
  const add = (statut, controle, detail = '') => rows.push({ statut, controle, detail: String(detail).replace(/\s+/g, ' ').slice(0, 400) });
  return {
    rows,
    ok: (c, d) => add('ok', c, d),
    ko: (c, d) => add('ko', c, d),
    alerte: (c, d) => add('alerte', c, d),
    check: (cond, c, d) => add(cond ? 'ok' : 'ko', c, d),
    end(nomFichier) {
      const mark = { ok: '✅', ko: '❌', alerte: '⚠️' };
      const md = `## ${titre}\n\n*${new Date().toISOString()}*\n\n| | Contrôle | Détail |\n|---|---|---|\n` +
        rows.map((r) => `| ${mark[r.statut]} | ${r.controle} | ${r.detail.replace(/\|/g, '\\|')} |`).join('\n') + '\n\n';
      const dir = process.env.RAPPORT_DIR || path.join(process.cwd(), 'rapports');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, nomFichier + '.md'), md);
      fs.writeFileSync(path.join(dir, nomFichier + '.json'), JSON.stringify({ titre, date: new Date().toISOString(), rows }, null, 2));
      if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
      console.log(md);
      const n = rows.filter((r) => r.statut === 'ko').length;
      process.exitCode = n ? 1 : 0;
      return n;
    },
  };
}
module.exports = { report };

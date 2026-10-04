import { useState } from "react";

const items: Array<{ term: string; explain: string }> = [
  {
    term: "Tunnel fermé",
    explain:
      "Un tunnel entièrement couvert, comme un grand tube sous une montagne ou une ville. On y entre, on roule, on en ressort — souvent éclairé à l'intérieur.",
  },
  {
    term: "Passage couvert",
    explain:
      "Une section de route avec un toit au-dessus, plus courte qu'un vrai tunnel. C'est comme passer sous un grand pont ou une galerie.",
  },
  {
    term: "Type inconnu",
    explain:
      "Une source signale un ouvrage couvert, mais les informations disponibles ne permettent pas encore de le classer précisément.",
  },
  {
    term: "Tout doux",
    explain: "Aucun tunnel identifié par les sources actuellement vérifiées.",
  },
  {
    term: "Tranquille",
    explain: "Quelques tout petits tunnels, très courts. À peine le temps de t'en rendre compte.",
  },
  {
    term: "Quelques tunnels",
    explain:
      "Il y a des tunnels sur la route, certains pas tout petits. Tu sais à l'avance où ils sont et combien de temps ils durent.",
  },
  {
    term: "Plusieurs tunnels",
    explain:
      "Le trajet passe par plusieurs tunnels ou par un tunnel plus long. Your Way te montre chacun à l'avance pour que rien ne te surprenne.",
  },
  {
    term: "Confiance",
    explain:
      "À quel point les informations sur les tunnels sont complètes pour ce trajet. Plus la confiance est élevée, plus la liste est précise.",
  },
];

export function Glossary() {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-2xl bg-card border border-border/60 shadow-soft overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-secondary/40 transition"
      >
        <div>
          <div className="text-sm font-medium">Petit guide des mots</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Pour comprendre tranquillement ce que Your Way affiche.
          </div>
        </div>
        <span className="text-muted-foreground text-lg leading-none">{open ? "–" : "+"}</span>
      </button>
      {open && (
        <dl className="px-4 pb-4 pt-1 space-y-3">
          {items.map((it) => (
            <div key={it.term}>
              <dt className="text-sm font-medium">{it.term}</dt>
              <dd className="text-xs text-muted-foreground leading-relaxed mt-0.5">{it.explain}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

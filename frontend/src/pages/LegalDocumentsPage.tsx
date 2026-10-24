import { ArrowLeft, FileText, Info, Scale, ShieldCheck } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getClusterPrefix } from "../api/client";
import { useLanguage, useStrings } from "../i18n/LanguageContext";
import {
  getLegalDocument,
  getLegalDocuments,
  isLegalDocumentId,
  legalContact,
  type LegalDocumentId
} from "../legal/legalContent";

const documentIcons = {
  privacy: ShieldCheck,
  terms: Scale,
  data: Info,
  "release-notes": FileText
} as const;

function DocumentBody({ id }: { id: LegalDocumentId }) {
  const { resolvedLanguage } = useLanguage();
  const strings = useStrings();
  const document = getLegalDocument(resolvedLanguage, id);

  return (
    <article className="legal-document">
      <header className="legal-document__header">
        <p className="legal-document__meta">{strings.brand.name} · {document.updatedLabel}</p>
        <h1>{document.title}</h1>
        <p>{document.summary}</p>
      </header>
      <div className="legal-document__content">
        {document.sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {section.bullets && (
              <ul>
                {section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
              </ul>
            )}
          </section>
        ))}
      </div>
    </article>
  );
}

export default function LegalDocumentsPage() {
  const navigate = useNavigate();
  const { document: requestedDocument } = useParams();
  const { resolvedLanguage } = useLanguage();
  const documents = getLegalDocuments(resolvedLanguage);
  const clusterPrefix = getClusterPrefix();
  const currentDocument = isLegalDocumentId(requestedDocument) ? requestedDocument : null;
  const title = resolvedLanguage === "ru" ? "Правовая информация" : "Legal information";
  const backLabel = resolvedLanguage === "ru" ? "Вернуться" : "Go back";
  const contactLabel = resolvedLanguage === "ru" ? "Контакты оператора" : "Operator contact";

  return (
    <main className="legal-page">
      <div className="legal-page__frame">
        <button type="button" className="legal-back-button" onClick={() => navigate(`${clusterPrefix}/app/settings?section=help-about`)}>
          <ArrowLeft size={18} aria-hidden="true" />
          {backLabel}
        </button>
        <div className="legal-page__layout">
          <aside className="legal-page__navigation" aria-label={title}>
            <p className="legal-page__eyebrow">Stovo</p>
            <h2>{title}</h2>
            <nav>
              {(Object.keys(documents) as LegalDocumentId[]).map((id) => {
                const Icon = documentIcons[id];
                return (
                  <Link className={currentDocument === id ? "is-active" : ""} key={id} to={`${clusterPrefix}/legal/${id}`}>
                    <Icon size={18} aria-hidden="true" />
                    <span>{documents[id].title}</span>
                  </Link>
                );
              })}
            </nav>
            <address>
              <strong>{contactLabel}</strong>
              <span>{resolvedLanguage === "ru" ? legalContact.operator : legalContact.operatorEnglish}</span>
              <span>{resolvedLanguage === "ru" ? legalContact.address : legalContact.addressEnglish}</span>
              <a href={`mailto:${legalContact.email}`}>{legalContact.email}</a>
            </address>
          </aside>
          {currentDocument ? (
            <DocumentBody id={currentDocument} />
          ) : (
            <section className="legal-document legal-document--index">
              <header className="legal-document__header">
                <p className="legal-document__meta">Stovo</p>
                <h1>{title}</h1>
                <p>{resolvedLanguage === "ru" ? "Выберите документ, чтобы ознакомиться с ним полностью." : "Choose a document to read it in full."}</p>
              </header>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

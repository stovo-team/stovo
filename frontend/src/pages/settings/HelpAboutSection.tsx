import { ExternalLink, FileText, Info, Mail, Scale, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import VeloLogo from "../../components/VeloLogo";
import { getClusterPrefix } from "../../api/client";
import { appRelease } from "../../legal/appRelease";
import { getLegalDocuments, legalContact, type LegalLanguage } from "../../legal/legalContent";

const documentIcons = {
  privacy: ShieldCheck,
  terms: Scale,
  data: Info,
  "release-notes": FileText
} as const;

export function HelpAboutSection({ language }: { language: LegalLanguage }) {
  const documents = getLegalDocuments(language);
  const clusterPrefix = getClusterPrefix();
  const operator = language === "ru" ? legalContact.operator : legalContact.operatorEnglish;
  const copy = language === "ru"
    ? {
        version: "Версия приложения",
        webBuild: "Веб-сборка",
        support: "Поддержка",
        supportText: "Нужна помощь, хотите сообщить об ошибке или у вас есть вопрос о данных? Свяжитесь с нами.",
        legal: "Документы и сведения",
        open: "Открыть",
        operator: "Оператор сервиса",
        address: "Адрес",
        dataRequest: "Запрос по персональным данным или безопасности"
      }
    : {
        version: "App version",
        webBuild: "Web build",
        support: "Support",
        supportText: "Need help, want to report a problem, or have a question about data? Contact us.",
        legal: "Documents and information",
        open: "Open",
        operator: "Service operator",
        address: "Address",
        dataRequest: "Personal-data or security request"
      };

  return (
    <div className="help-about">
      <section className="help-about__hero">
        <div className="help-about__mark"><VeloLogo title="Stovo" /></div>
        <div>
          <p>Stovo</p>
          <h3>{copy.version} {appRelease.version}</h3>
          <span>{copy.webBuild} {appRelease.webBuild} · {appRelease.publishedOn}</span>
        </div>
      </section>

      <section className="help-about__card">
        <div className="help-about__card-heading">
          <Mail size={20} aria-hidden="true" />
          <div><h3>{copy.support}</h3><p>{copy.supportText}</p></div>
        </div>
        <div className="help-about__contact-actions">
          <a href={`mailto:${legalContact.email}`}><Mail size={17} aria-hidden="true" />{legalContact.email}</a>
        </div>
        <a className="help-about__data-request" href={`mailto:${legalContact.email}?subject=${encodeURIComponent(copy.dataRequest)}`}>
          {copy.dataRequest}<ExternalLink size={15} aria-hidden="true" />
        </a>
      </section>

      <section className="help-about__card">
        <div className="help-about__card-heading">
          <Scale size={20} aria-hidden="true" />
          <div><h3>{copy.legal}</h3><p>{operator} · {language === "ru" ? legalContact.address : legalContact.addressEnglish}</p></div>
        </div>
        <div className="help-about__documents">
          {Object.entries(documents).map(([id, document]) => {
            const documentId = id as keyof typeof documentIcons;
            const Icon = documentIcons[documentId];
            return (
              <Link key={id} to={`${clusterPrefix}/legal/${id}`}>
                <Icon size={19} aria-hidden="true" />
                <span><strong>{document.title}</strong><small>{document.summary}</small></span>
                <span className="help-about__open">{copy.open}<ExternalLink size={14} aria-hidden="true" /></span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

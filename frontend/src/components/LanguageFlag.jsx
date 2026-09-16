import { LANGUAGE_TO_FLAG } from "../constants";

const LanguageFlag = ({ language }) => {
  if (!language) {
    return null;
  }

  const normalizedLanguage = language.toLowerCase();
  const countryCode = LANGUAGE_TO_FLAG[normalizedLanguage];

  if (!countryCode) {
    return null;
  }

  return (
    <img
      src={`https://flagcdn.com/24x18/${countryCode}.png`}
      alt={`${normalizedLanguage} flag`}
      className="h-3 mr-1 inline-block"
    />
  );
};

export default LanguageFlag;

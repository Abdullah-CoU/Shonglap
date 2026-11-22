import { useTranslation } from 'react-i18next';

/**
 * Category icons matching the familiar civic-complaint pattern.
 * Tapping a category adds its keyword to the complaint text so extraction
 * can detect it.
 */
export const CATEGORIES = [
  { key: 'road', icon: '🛣️', en: 'Road', bn: 'রাস্তা', keyword: 'রাস্তা' },
  { key: 'mosquito', icon: '🦟', en: 'Mosquito', bn: 'মশা', keyword: 'মশা' },
  { key: 'garbage', icon: '🗑️', en: 'Garbage', bn: 'আবর্জনা', keyword: 'ময়লা' },
  { key: 'streetlight', icon: '💡', en: 'Street Light', bn: 'রাস্তার বাতি', keyword: 'বাতি' },
  { key: 'sewerage', icon: '🚿', en: 'Drainage', bn: 'নর্দমা', keyword: 'ড্রেন' },
  { key: 'water', icon: '💧', en: 'Water', bn: 'পানি', keyword: 'পানি' },
  { key: 'construction', icon: '🏗️', en: 'Illegal Build', bn: 'অবৈধ স্থাপনা', keyword: 'অবৈধ নির্মাণ' },
  { key: 'waterlogging', icon: '🌊', en: 'Waterlogging', bn: 'জলাবদ্ধতা', keyword: 'জলাবদ্ধতা' },
  { key: 'electricity', icon: '⚡', en: 'Electricity', bn: 'বিদ্যুৎ', keyword: 'বিদ্যুৎ' },
  { key: 'gas', icon: '🔥', en: 'Gas', bn: 'গ্যাস', keyword: 'গ্যাস' },
  { key: 'traffic', icon: '🚦', en: 'Traffic', bn: 'ট্রাফিক', keyword: 'ট্রাফিক' },
  { key: 'crime', icon: '👮', en: 'Security', bn: 'নিরাপত্তা', keyword: 'পুলিশ' },
  { key: 'pollution', icon: '🏭', en: 'Pollution', bn: 'দূষণ', keyword: 'দূষণ' },
  { key: 'fire', icon: '🚒', en: 'Fire', bn: 'আগুন', keyword: 'আগুন' },
];

/**
 * @param {Object} props
 * @param {string} props.selected - Currently selected category key
 * @param {Function} props.onSelect - Callback(category) when tapped
 * @param {string} [props.title] - Section title
 */
export default function CategoryGrid({ selected, onSelect, title }) {
  const { i18n } = useTranslation();
  const isBn = i18n.language === 'bn';

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      {title && <h3 className="text-center font-semibold text-blue-900 mb-4">{title}</h3>}
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
        {CATEGORIES.map((c) => {
          const active = selected === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onSelect(c)}
              className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-all ${
                active
                  ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-300'
                  : 'border-transparent hover:border-gray-200 hover:bg-gray-50'
              }`}
            >
              <span className="text-2xl sm:text-3xl">{c.icon}</span>
              <span className={`text-[10px] sm:text-xs text-center leading-tight ${active ? 'text-blue-800 font-semibold' : 'text-gray-700'}`}>
                {isBn ? c.bn : c.en}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, LifeBuoy, Search, X } from 'lucide-react';

interface HelpCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

interface HelpSection {
  title: string;
  items: Array<{ question: string; answer: string[] }>;
}

const SECTIONS: HelpSection[] = [
  {
    title: 'Начало работы',
    items: [
      {
        question: 'С чего начать?',
        answer: [
          'Откройте меню профиля → «Профиль и безопасность»: укажите ФИО, номер свидетельства и налёт, перенесённый из бумажной книжки.',
          'Загрузите месячный план в разделе «Рабочее время» или импортируйте рейсы через меню профиля → «Импорт».',
          'Добавьте первый рейс кнопкой «Новый рейс» или клавишей N.',
        ],
      },
      {
        question: 'Работает ли приложение без интернета?',
        answer: [
          'Да, если приложение открыто по HTTPS и уже загружено один раз. Рейсы сохраняются на устройстве и уходят на сервер, когда появится связь.',
          'Цветная точка под названием в шапке показывает состояние: зелёная — всё синхронизировано, жёлтая — нет сети, красная — ошибка.',
        ],
      },
    ],
  },
  {
    title: 'Лётная книжка',
    items: [
      {
        question: 'В каком времени вводить рейс?',
        answer: [
          'Все времена — UTC: OUT (уборка колодок), OFF (взлёт), ON (посадка), IN (постановка на стоянку).',
          'Ночное время и ночные посадки рассчитываются автоматически по гражданским сумеркам вдоль маршрута.',
        ],
      },
      {
        question: 'Как вводить быстрее?',
        answer: [
          '«Частые рейсы» в форме подставляют маршрут, тип и борт одним нажатием.',
          'После ввода бортового номера тип ВС подставляется из прошлых рейсов.',
          'В карточке рейса есть «Повторить» (тот же рейс сегодня) и «Обратный рейс».',
        ],
      },
      {
        question: 'Что такое черновики?',
        answer: [
          'Черновики создаются из месячного плана кнопкой «В книжку» в разделе «Рабочее время». В них уже есть маршрут, плановое время и ночь.',
          'Черновик не входит в налёт, пока вы его не подтвердите: откройте его после полёта, внесите факт, борт и посадки и нажмите «Подтвердить рейс».',
        ],
      },
      {
        question: 'Где записывать тренажёр и наземную подготовку?',
        answer: [
          'В книжке нажмите «Тренажёр или подготовка» или кнопку «Тренажёр» на главной.',
          'Это время не входит в налёт. Взлёты и посадки на FFS в роли PF засчитываются в правило 90 дней.',
        ],
      },
      {
        question: 'Как распечатать книжку?',
        answer: [
          'Меню профиля → «Экспорт»: «Книжка EASA» с колонками AMC1 FCL.050 или «Лётная книжка РФ».',
          'На каждой странице есть итог страницы, перенос с предыдущих страниц и общий итог, включая перенесённый налёт. Сессии тренажёра печатаются в своей колонке.',
        ],
      },
    ],
  },
  {
    title: 'Рабочее время',
    items: [
      {
        question: 'Как загрузить план?',
        answer: [
          '«Загрузить план» принимает PDF с текстом. Формат плана Аэрофлота распознаётся полностью; после загрузки приложение сверяет налёт с итогом из самого плана.',
          'Скан без текста прочитать нельзя: такие строки добавьте вручную.',
          '«Ростер по ссылке» загружает календарь .ics из личного кабинета (например, crew.aeroflot.ru). Ссылка хранится только на этом устройстве; повторная загрузка обновит изменившиеся события и сохранит ваши комментарии.',
        ],
      },
      {
        question: 'Как считается рабочее время?',
        answer: [
          'Смена начинается за 60 минут до первого вылета и заканчивается через 30 минут после последнего выключения двигателей. Оба значения меняются в «Ставках для расчёта».',
          'Рейс туда-обратно — одна смена: пока экипаж не вернулся на базу, ожидание между рейсами входит в рабочее время. Ночёвка вне базы (отдых захватывает ночь с 22:00 до 06:00) считается разделённой сменой: отдых в гостинице в рабочее время не входит. Стоянка от 12 часов — отдельные смены. Дома участки с перерывом до 4 часов — тоже одна смена. Приложение предупреждает о полётной смене дольше 13 часов и об отдыхе меньше 12 часов или меньше предыдущей смены.',
          'Если смену разделили, выберите в колонке «Смена» значение «Разделённая» — одна смена с отдыхом, например в гостинице: время отдыха не входит в рабочее время, а допустимая полётная смена увеличивается на половину перерыва от 3 часов. «Новая смена» начинает отдельную смену даже после короткой стоянки.',
          'В тех же настройках укажите часовой пояс плана (по умолчанию МСК): он нужен, чтобы черновики получили время в UTC.',
        ],
      },
    ],
  },
  {
    title: 'Допуски и сроки',
    items: [
      {
        question: 'Как считается правило 90 дней?',
        answer: [
          'По типовому рейтингу: A318–A321 считаются вместе, как и вся линейка B737. Взлёт и посадка засчитываются только парой и только в роли PF.',
          'EASA ночью нужен хотя бы один ночной взлёт и посадка (держатели IR освобождены), FAA — три ночные посадки до полной остановки.',
          'Правила меняются в «Правилах расчёта» на странице допусков: свои группы типов, период и число посадок, наличие IR.',
          'Это оценка по записям книжки, а не юридическое подтверждение.',
        ],
      },
      {
        question: 'Как следить за ВЛЭК, LPC и документами?',
        answer: ['Добавьте сроки на странице допусков. Главная заранее предупредит об истечении: за 90 дней жёлтым, за 30 дней красным.'],
      },
    ],
  },
  {
    title: 'Статистика',
    items: [
      {
        question: 'Что есть в статистике?',
        answer: [
          '«Обзор»: налёт за 12 месяцев, год, всё время или свой период, с разбивкой по типам, ролям, дням недели и аэродромам.',
          '«Итоги года»: рекорды, новые аэродромы и карта года; итогами можно поделиться или сохранить их картинкой.',
          '«Сравнение лет»: налёт по месяцам нескольких лет на одном графике.',
        ],
      },
      {
        question: 'Что показывает прогноз лимитов?',
        answer: [
          'Если в «Рабочем времени» есть план, на главной под каждым лимитом видно, сколько будет налёта при выполнении плана и не будет ли превышения.',
        ],
      },
    ],
  },
  {
    title: 'Аккаунт и данные',
    items: [
      {
        question: 'Что будет с рейсами при выходе?',
        answer: ['Копия на устройстве удаляется. Если какие-то рейсы ещё не дошли до сервера, приложение предупредит до выхода.'],
      },
      {
        question: 'Как сменить пароль или удалить аккаунт?',
        answer: ['Меню профиля → «Профиль и безопасность» → вкладка «Безопасность». Смена пароля завершает сессии на других устройствах.'],
      },
      {
        question: 'Какие есть горячие клавиши?',
        answer: ['N — новый рейс, / — поиск по книжке. Работают на любой раскладке.'],
      },
    ],
  },
];

export const HelpCenter: React.FC<HelpCenterProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');

  const sections = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return SECTIONS;
    return SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) => [item.question, ...item.answer].join(' ').toLowerCase().includes(needle)),
    })).filter((section) => section.items.length > 0);
  }, [query]);

  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
      window.addEventListener('keydown', onKeyDown);
      return () => {
        document.body.style.overflow = originalOverflow;
        window.removeEventListener('keydown', onKeyDown);
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[92vh] flex flex-col bg-avionics-surface border border-avionics-border rounded-t-3xl sm:rounded-2xl shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-avionics-border">
          <h2 id="help-title" className="flex items-center space-x-2 text-base font-bold text-avionics-text">
            <LifeBuoy className="w-5 h-5 text-sky-400" />
            <span>Справка</span>
          </h2>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="p-1.5 text-avionics-muted hover:text-avionics-text cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pt-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-avionics-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по справке: черновик, IR, печать..."
              aria-label="Поиск по справке"
              autoFocus
              className="w-full bg-avionics-card border border-avionics-border rounded-xl pl-9 pr-3 py-2 text-sm text-avionics-text focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>

        <div className="p-5 overflow-y-auto overscroll-contain space-y-5">
          {sections.length === 0 && <p className="text-sm text-avionics-muted">Ничего не найдено.</p>}
          {sections.map((section) => (
            <section key={section.title}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-avionics-muted mb-2">{section.title}</h3>
              <div className="space-y-1.5">
                {section.items.map((item) => (
                  <details key={item.question} className="group rounded-xl bg-avionics-card border border-avionics-border" open={Boolean(query.trim())}>
                    <summary className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm font-semibold text-avionics-text cursor-pointer list-none">
                      <span>{item.question}</span>
                      <ChevronDown className="w-4 h-4 text-avionics-muted shrink-0 transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="px-3.5 pb-3 space-y-1.5 text-sm text-avionics-muted leading-relaxed">
                      {item.answer.map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};

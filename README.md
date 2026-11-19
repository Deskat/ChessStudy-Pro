# ChessStudy Pro

ChessStudy Pro — шахматный анализатор с Stockfish 19, редактором позиции, распознаванием доски и наборами фигур Cburnett / Cburnett V2.

## Запуск

- **ПК:** https://deskat.github.io/ChessStudy-Pro/pc.html
- **Телефон:** https://deskat.github.io/ChessStudy-Pro/

## Версия для ПК

Отдельная страница `pc.html` рассчитана на широкие экраны: увеличенная доска слева, настройки Stockfish справа, редактор позиции ниже. На узких экранах сохраняется адаптивная мобильная компоновка.

В этой опубликованной веб-сборке Stockfish 19 Full и Lite используют однопоточные WebAssembly-файлы. Поэтому параметр Threads зафиксирован на 1; команда UCI Threads не может увеличить число потоков для этих сборок. Многопоточные варианты Stockfish.js требуют cross-origin isolation и заголовки COOP/COEP на странице.

## Основные файлы

- `index.html` — адаптивная мобильная версия.
- `pc.html` — отдельная версия для ПК.
- `engine/` — Stockfish 19 Full / Lite (single-thread).
- `pieces/` — Cburnett и Cburnett V2 SVG.
- `recognition/` — локальное распознавание шахматной доски.

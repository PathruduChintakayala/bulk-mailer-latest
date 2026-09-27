/**
 * Extra inline typography attributes (spec 5.2).
 *
 * TipTap's textStyle mark only carries colour and font family out of the box.
 * The composer also needs size, weight, line height, letter spacing and case,
 * all rendered as inline styles because email clients ignore stylesheets.
 */

import { Extension } from '@tiptap/core';

interface StyleAttribute {
  name: string;
  cssProperty: string;
  /** Read the value back so round-tripping stored HTML keeps the attribute. */
  read: (element: HTMLElement) => string | null;
}

const ATTRIBUTES: StyleAttribute[] = [
  { name: 'fontSize', cssProperty: 'font-size', read: element => element.style.fontSize || null },
  { name: 'fontWeight', cssProperty: 'font-weight', read: element => element.style.fontWeight || null },
  { name: 'lineHeight', cssProperty: 'line-height', read: element => element.style.lineHeight || null },
  { name: 'letterSpacing', cssProperty: 'letter-spacing', read: element => element.style.letterSpacing || null },
  { name: 'textTransform', cssProperty: 'text-transform', read: element => element.style.textTransform || null },
];

export const TextStyleExtras = Extension.create({
  name: 'textStyleExtras',

  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: Object.fromEntries(
          ATTRIBUTES.map(attribute => [
            attribute.name,
            {
              default: null,
              parseHTML: attribute.read,
              renderHTML: (attrs: Record<string, unknown>) => {
                const value = attrs[attribute.name];
                if (!value) return {};
                return { style: `${attribute.cssProperty}: ${value}` };
              },
            },
          ])
        ),
      },
    ];
  },
});

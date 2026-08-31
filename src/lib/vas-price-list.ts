/**
 * T-Gloss / Lexus VAS treatment price list — master reference data.
 *
 * Sourced from "VAS July 26 PL-Service.xlsx" (2026-08-31), one row per
 * treatment job code, with the retail price for each vehicle size class,
 * split by city tier (see branch-tier.ts). Tier A prices are read from
 * co01b's own sheet, Tier B from kt01a's own sheet — verified byte-identical
 * across every branch within each tier — rather than the workbook's
 * "Summary VALO"/"Summary oplnt" roll-up tabs, whose retail prices didn't
 * quite match what's actually in each branch's own sheet (confirmed with
 * the user, e.g. kt01a's own Medium price of Rs 1,233 vs Summary oplnt's Rs
 * 1,226 for the same treatment). Confirmed correct by the user 2026-08-31 —
 * see the "T-Gloss Price List" artifact. Update this file (regenerate via
 * scripts/gen-vas-price-list.mjs) only when the user brings a revised sheet.
 *
 * null means that size class isn't offered for the treatment (nine
 * Lexus-only treatments price at Ex. Large only).
 */

export type VasSize = "small" | "medium" | "large" | "xl";

export type VasTreatmentPrice = {
  jobCode: string;
  category: string;
  name: string;
  tierA: Record<VasSize, number | null>;
  tierB: Record<VasSize, number | null>;
};

export const VAS_PRICE_LIST: VasTreatmentPrice[] = [
  {
    "jobCode": "99TGSH01",
    "category": "Health",
    "name": "TGLOSS AC Duct Cleaning and Disinfectant",
    "tierA": {
      "small": 1176,
      "medium": 1238.26,
      "large": 1467.53,
      "xl": 1712.96
    },
    "tierB": {
      "small": 1183,
      "medium": 1233,
      "large": 1462,
      "xl": 1709
    }
  },
  {
    "jobCode": "99TGSH05",
    "category": "Health",
    "name": "TGLOSS Air Fresh- Front and Rear",
    "tierA": {
      "small": 4832,
      "medium": 4498.54,
      "large": 4644.99,
      "xl": 4832
    },
    "tierB": {
      "small": null,
      "medium": 4478,
      "large": 4628,
      "xl": 4864
    }
  },
  {
    "jobCode": "99TGSH03",
    "category": "Health",
    "name": "TGLOSS Air Fresh-Front Evaporator",
    "tierA": {
      "small": 2600,
      "medium": 2709.83,
      "large": 2742.15,
      "xl": 2797
    },
    "tierB": {
      "small": 2619,
      "medium": 2704,
      "large": 2736,
      "xl": 2820
    }
  },
  {
    "jobCode": "99TGSH04",
    "category": "Health",
    "name": "TGLOSS Air Fresh-Rear Evaporator",
    "tierA": {
      "small": 2736,
      "medium": 2572.47,
      "large": 2707.81,
      "xl": 2736
    },
    "tierB": {
      "small": null,
      "medium": 2563,
      "large": 2699,
      "xl": 2755
    }
  },
  {
    "jobCode": "99TGSR08",
    "category": "Restoration",
    "name": "TGLOSS Alloy Wheel Cleaning & Protection",
    "tierA": {
      "small": 1809,
      "medium": 1886.68,
      "large": 2100.8,
      "xl": 2451.27
    },
    "tierB": {
      "small": 1816,
      "medium": 1878,
      "large": 2092,
      "xl": 2443
    }
  },
  {
    "jobCode": "99TGSA06",
    "category": "Appearance",
    "name": "TGLOSS Ceramic Coating",
    "tierA": {
      "small": 11370,
      "medium": 14847,
      "large": 19897,
      "xl": 25502.5
    },
    "tierB": {
      "small": 10858,
      "medium": 14039,
      "large": 18837,
      "xl": 24190
    }
  },
  {
    "jobCode": "99TGSA07",
    "category": "Appearance",
    "name": "TGLOSS Ceramic Coating+1Booster",
    "tierA": {
      "small": 14260,
      "medium": 18493.1,
      "large": 24270.3,
      "xl": 29880.85
    },
    "tierB": {
      "small": 13620,
      "medium": 17493,
      "large": 22983,
      "xl": 28331
    }
  },
  {
    "jobCode": "99TGSA02",
    "category": "Appearance",
    "name": "TGLOSS CERAMIC COATING WITH 2 BOOSTERS [+2]",
    "tierA": {
      "small": 17150,
      "medium": 22139.2,
      "large": 28643.6,
      "xl": 34259.2
    },
    "tierB": {
      "small": 16382,
      "medium": 20947,
      "large": 27129,
      "xl": 32472
    }
  },
  {
    "jobCode": "99TGSA09",
    "category": "Appearance",
    "name": "TGLOSS Graphene Coating",
    "tierA": {
      "small": 13620,
      "medium": 19543.5,
      "large": 24745,
      "xl": 30401
    },
    "tierB": {
      "small": 13433,
      "medium": 19039,
      "large": 24139,
      "xl": 29694
    }
  },
  {
    "jobCode": "99TGSA10",
    "category": "Appearance",
    "name": "TGLOSS Graphene Coating +1 Booster",
    "tierA": {
      "small": 16510,
      "medium": 23189.6,
      "large": 29118.3,
      "xl": 34779.35
    },
    "tierB": {
      "small": 16195,
      "medium": 22493,
      "large": 28285,
      "xl": 33835
    }
  },
  {
    "jobCode": "99TGSA11",
    "category": "Appearance",
    "name": "TGLOSS GRAPHENE COATING WITH 2 BOOSTERS [+2]",
    "tierA": {
      "small": 19400,
      "medium": 26835.7,
      "large": 33491.6,
      "xl": 39157.7
    },
    "tierB": {
      "small": 18958,
      "medium": 25947,
      "large": 32431,
      "xl": 37976
    }
  },
  {
    "jobCode": "99TGSA13",
    "category": "Appearance",
    "name": "Lexus Graphene Coating with 3 Boosters [+3]",
    "tierA": {
      "small": null,
      "medium": null,
      "large": null,
      "xl": 62500
    },
    "tierB": {
      "small": null,
      "medium": null,
      "large": null,
      "xl": 62500
    }
  },
  {
    "jobCode": "99TGSA12",
    "category": "Appearance",
    "name": "TGLOSS GRAPHENE COATING WITH 3 BOOSTERS [+3]",
    "tierA": {
      "small": 22290,
      "medium": 30481.8,
      "large": 37864.9,
      "xl": 43536.05
    },
    "tierB": {
      "small": 21720,
      "medium": 29401,
      "large": 36577,
      "xl": 42117
    }
  },
  {
    "jobCode": "99TGSA2E",
    "category": "Appearance",
    "name": "TGLOSS Ceramic Panel Front Door (RH)",
    "tierA": {
      "small": 1027,
      "medium": 1146,
      "large": 1397,
      "xl": 1528
    },
    "tierB": {
      "small": 1027,
      "medium": 1146,
      "large": 1397,
      "xl": 1528
    }
  },
  {
    "jobCode": "99TGSA2F",
    "category": "Appearance",
    "name": "TGLOSS Ceramic Panel Front Door (LH)",
    "tierA": {
      "small": 1027,
      "medium": 1146,
      "large": 1397,
      "xl": 1528
    },
    "tierB": {
      "small": 1027,
      "medium": 1146,
      "large": 1397,
      "xl": 1528
    }
  },
  {
    "jobCode": "99TGSR01",
    "category": "Restoration",
    "name": "TGLOSS Exterior Beautification",
    "tierA": {
      "small": 2089,
      "medium": 2175.54,
      "large": 2476.52,
      "xl": 2702.76
    },
    "tierB": {
      "small": 2065,
      "medium": 2136,
      "large": 2442,
      "xl": 2670
    }
  },
  {
    "jobCode": "99TGSA04",
    "category": "Restoration",
    "name": "TGLOSS GLOSS BODY COATING",
    "tierA": {
      "small": 10089,
      "medium": 10644.39,
      "large": 13205.75,
      "xl": 13963.25
    },
    "tierB": {
      "small": 10100,
      "medium": 10555,
      "large": 13130,
      "xl": 13888
    }
  },
  {
    "jobCode": "99TGSR07",
    "category": "Restoration",
    "name": "TGLOSS Headlamp Restoration",
    "tierA": {
      "small": 1380,
      "medium": 1545.3,
      "large": 1702.86,
      "xl": 1750.33
    },
    "tierB": {
      "small": 1389,
      "medium": 1540,
      "large": 1698,
      "xl": 1745
    }
  },
  {
    "jobCode": "99TGSR06",
    "category": "Restoration",
    "name": "TGLOSS Int. Enrich. with Leather Conditioner",
    "tierA": {
      "small": 3574,
      "medium": 3844.06,
      "large": 4430.87,
      "xl": 4646
    },
    "tierB": {
      "small": 3543,
      "medium": 3784,
      "large": 4379,
      "xl": 4597
    }
  },
  {
    "jobCode": "99TGSR03",
    "category": "Restoration",
    "name": "TGLOSS Interior Enrichment",
    "tierA": {
      "small": 1375,
      "medium": 1436.22,
      "large": 1593.78,
      "xl": 1814.97
    },
    "tierB": {
      "small": 1322,
      "medium": 1377,
      "large": 1542,
      "xl": 1765
    }
  },
  {
    "jobCode": "99TGSR05",
    "category": "Restoration",
    "name": "TGLOSS Interior Enrichment with Disinfectant",
    "tierA": {
      "small": 2818,
      "medium": 3391.58,
      "large": 3931.93,
      "xl": 4344.01
    },
    "tierB": {
      "small": 2780,
      "medium": 3332,
      "large": 3880,
      "xl": 4295
    }
  },
  {
    "jobCode": "99TGSP02",
    "category": "Protection",
    "name": "TGLOSS Internal Panel Coating",
    "tierA": {
      "small": 2914,
      "medium": 3399.66,
      "large": 3817.8,
      "xl": 4176.35
    },
    "tierB": {
      "small": 2932,
      "medium": 3391,
      "large": 3809,
      "xl": 4168
    }
  },
  {
    "jobCode": "99TGSR12",
    "category": "Restoration",
    "name": "TGLOSS Logo Cleaning",
    "tierA": {
      "small": 477,
      "medium": 494.9,
      "large": 513.08,
      "xl": 540.35
    },
    "tierB": {
      "small": 471,
      "medium": 485,
      "large": 504,
      "xl": 532
    }
  },
  {
    "jobCode": "99TGSR11",
    "category": "Restoration",
    "name": "TGLOSS Mech Care",
    "tierA": {
      "small": 571,
      "medium": 603.98,
      "large": 639.33,
      "xl": 656.5
    },
    "tierB": {
      "small": 572,
      "medium": 599,
      "large": 635,
      "xl": 652
    }
  },
  {
    "jobCode": "99TGSH02",
    "category": "Health",
    "name": "TGLOSS Odour Neutralizer & Disinfectant",
    "tierA": {
      "small": 821,
      "medium": 845.37,
      "large": 866.58,
      "xl": 881.73
    },
    "tierB": {
      "small": 824,
      "medium": 840,
      "large": 863,
      "xl": 878
    }
  },
  {
    "jobCode": "99TGSR14",
    "category": "Restoration",
    "name": "TGLOSS Plastic Care",
    "tierA": {
      "small": 562,
      "medium": 615.09,
      "large": 638.32,
      "xl": 677.71
    },
    "tierB": {
      "small": 559,
      "medium": 607,
      "large": 631,
      "xl": 672
    }
  },
  {
    "jobCode": "99TGSR02",
    "category": "Restoration",
    "name": "TGLOSS Premium Exterior Care",
    "tierA": {
      "small": 4793,
      "medium": 5193.42,
      "large": 5952.94,
      "xl": 6288.26
    },
    "tierB": {
      "small": 4775,
      "medium": 5134,
      "large": 5901,
      "xl": 6239
    }
  },
  {
    "jobCode": "99TGSR04",
    "category": "Restoration",
    "name": "TGLOSS Premium Interior Enrichment",
    "tierA": {
      "small": 2281,
      "medium": 2512.88,
      "large": 2813.86,
      "xl": 3038.08
    },
    "tierB": {
      "small": 2237,
      "medium": 2453,
      "large": 2762,
      "xl": 2989
    }
  },
  {
    "jobCode": "99TGSS01",
    "category": "Safety",
    "name": "TGLOSS Rat Repellent",
    "tierA": {
      "small": 909,
      "medium": 978.69,
      "large": 1058.48,
      "xl": 1098.88
    },
    "tierB": {
      "small": 913,
      "medium": 974,
      "large": 1054,
      "xl": 1095
    }
  },
  {
    "jobCode": "99TGSP03",
    "category": "Protection",
    "name": "TGLOSS Silencer Coating",
    "tierA": {
      "small": 1394,
      "medium": 1488.74,
      "large": 1548.33,
      "xl": 1611.96
    },
    "tierB": {
      "small": 1399,
      "medium": 1481,
      "large": 1541,
      "xl": 1605
    }
  },
  {
    "jobCode": "99TGSR13",
    "category": "Restoration",
    "name": "TGLOSS Sunroof Maintenance",
    "tierA": {
      "small": 478,
      "medium": 438.34,
      "large": 457.53,
      "xl": 482.78
    },
    "tierB": {
      "small": null,
      "medium": 429,
      "large": 448,
      "xl": 475
    }
  },
  {
    "jobCode": "99TGSP01",
    "category": "Protection",
    "name": "TGLOSS Underbody Coating",
    "tierA": {
      "small": 4002,
      "medium": 4631.86,
      "large": 5547.93,
      "xl": 6103.43
    },
    "tierB": {
      "small": 4020,
      "medium": 4612,
      "large": 5531,
      "xl": 6087
    }
  },
  {
    "jobCode": "99TGSA01",
    "category": "Appearance",
    "name": "TGLOSS UV Protection",
    "tierA": {
      "small": 1226,
      "medium": 1371.58,
      "large": 1483.69,
      "xl": 1560.45
    },
    "tierB": {
      "small": 1216,
      "medium": 1351,
      "large": 1467,
      "xl": 1543
    }
  },
  {
    "jobCode": "99TGSCB1",
    "category": "Appearance",
    "name": "TGLOSS Air Conditioning Refresh Combo - Front",
    "tierA": {
      "small": 3422,
      "medium": 3536,
      "large": 3767,
      "xl": 4055
    },
    "tierB": {
      "small": 3422,
      "medium": 3536,
      "large": 3767,
      "xl": 4055
    }
  },
  {
    "jobCode": "99TGSCB2",
    "category": "Appearance",
    "name": "TGLOSS Air Conditioning Refresh combo Front & Rear",
    "tierA": {
      "small": null,
      "medium": 5151,
      "large": 5478,
      "xl": 5899
    },
    "tierB": {
      "small": null,
      "medium": 5151,
      "large": 5478,
      "xl": 5899
    }
  },
  {
    "jobCode": "99TGSCB3",
    "category": "Appearance",
    "name": "TGLOSS Cabin Care Combo",
    "tierA": {
      "small": 2919,
      "medium": 3095,
      "large": 3356,
      "xl": 3554
    },
    "tierB": {
      "small": 2919,
      "medium": 3095,
      "large": 3356,
      "xl": 3554
    }
  },
  {
    "jobCode": "99TGSCB4",
    "category": "Appearance",
    "name": "TGLOSS Ultimate Revamp",
    "tierA": {
      "small": 12712,
      "medium": 13433,
      "large": 14943,
      "xl": 16392
    },
    "tierB": {
      "small": 12712,
      "medium": 13433,
      "large": 14943,
      "xl": 16392
    }
  },
  {
    "jobCode": "99TGSCB5",
    "category": "Appearance",
    "name": "TGLOSS Monsoon care",
    "tierA": {
      "small": 6725,
      "medium": 7365,
      "large": 8208,
      "xl": 9262
    },
    "tierB": {
      "small": 6725,
      "medium": 7365,
      "large": 8208,
      "xl": 9262
    }
  },
  {
    "jobCode": "99TGSCB6",
    "category": "Appearance",
    "name": "TGLOSS Anti rust Care",
    "tierA": {
      "small": 7555,
      "medium": 8545,
      "large": 9768,
      "xl": 10633
    },
    "tierB": {
      "small": 7555,
      "medium": 8545,
      "large": 9768,
      "xl": 10633
    }
  },
  {
    "jobCode": "99TGSCB7",
    "category": "Appearance",
    "name": "TGLOSS complete protect",
    "tierA": {
      "small": 16805,
      "medium": 18200,
      "large": 21630,
      "xl": 23170
    },
    "tierB": {
      "small": 16805,
      "medium": 18200,
      "large": 21630,
      "xl": 23170
    }
  },
  {
    "jobCode": "99TGSCB8",
    "category": "Appearance",
    "name": "TGLOSS complete protect Pro",
    "tierA": {
      "small": 29956,
      "medium": 32812,
      "large": 37949,
      "xl": 40856
    },
    "tierB": {
      "small": 29956,
      "medium": 32812,
      "large": 37949,
      "xl": 40856
    }
  },
  {
    "jobCode": "99TGSA03",
    "category": "Appearance",
    "name": "Lexus Ceramic coating",
    "tierA": {
      "small": null,
      "medium": null,
      "large": null,
      "xl": 74317
    },
    "tierB": {
      "small": null,
      "medium": null,
      "large": null,
      "xl": 74317
    }
  },
  {
    "jobCode": "99TGSP04",
    "category": "Protection",
    "name": "Lexus Silencer coating",
    "tierA": {
      "small": null,
      "medium": null,
      "large": null,
      "xl": 2842
    },
    "tierB": {
      "small": null,
      "medium": null,
      "large": null,
      "xl": 2842
    }
  },
  {
    "jobCode": "99TGSP05",
    "category": "Protection",
    "name": "Lexus Internal Panel Coating",
    "tierA": {
      "small": null,
      "medium": null,
      "large": null,
      "xl": 5390
    },
    "tierB": {
      "small": null,
      "medium": null,
      "large": null,
      "xl": 5390
    }
  },
  {
    "jobCode": "99TGSS02",
    "category": "Safety",
    "name": "Lexus Rat repellent",
    "tierA": {
      "small": null,
      "medium": null,
      "large": null,
      "xl": 1956
    },
    "tierB": {
      "small": null,
      "medium": null,
      "large": null,
      "xl": 1956
    }
  },
  {
    "jobCode": "99TGSH06",
    "category": "Health",
    "name": "Lexus AC Duct Cleaning & Disinfectant",
    "tierA": {
      "small": null,
      "medium": null,
      "large": null,
      "xl": 1871
    },
    "tierB": {
      "small": null,
      "medium": null,
      "large": null,
      "xl": 1871
    }
  },
  {
    "jobCode": "99TGSR15",
    "category": "Restoration",
    "name": "Lexus Exterior Beautification",
    "tierA": {
      "small": null,
      "medium": null,
      "large": null,
      "xl": 13967
    },
    "tierB": {
      "small": null,
      "medium": null,
      "large": null,
      "xl": 13967
    }
  },
  {
    "jobCode": "99TGSR16",
    "category": "Restoration",
    "name": "Lexus Interior Enrichment",
    "tierA": {
      "small": null,
      "medium": null,
      "large": null,
      "xl": 7263
    },
    "tierB": {
      "small": null,
      "medium": null,
      "large": null,
      "xl": 7263
    }
  },
  {
    "jobCode": "99TGSR17",
    "category": "Restoration",
    "name": "Lexus Windshield Polishing-FR & RR",
    "tierA": {
      "small": null,
      "medium": null,
      "large": null,
      "xl": 5960
    },
    "tierB": {
      "small": null,
      "medium": null,
      "large": null,
      "xl": 5960
    }
  },
  {
    "jobCode": "99TGSR18",
    "category": "Restoration",
    "name": "Lexus Mech Care",
    "tierA": {
      "small": null,
      "medium": null,
      "large": null,
      "xl": 917
    },
    "tierB": {
      "small": null,
      "medium": null,
      "large": null,
      "xl": 917
    }
  },
  {
    "jobCode": "99TGSR19",
    "category": "Restoration",
    "name": "Lexus Logo Cleaning",
    "tierA": {
      "small": null,
      "medium": null,
      "large": null,
      "xl": 654
    },
    "tierB": {
      "small": null,
      "medium": null,
      "large": null,
      "xl": 654
    }
  },
  {
    "jobCode": "99TGSR09",
    "category": "Restoration",
    "name": "TGLOSS Windshield Polish -Front",
    "tierA": {
      "small": 1529,
      "medium": 1588.73,
      "large": 1686.7,
      "xl": 2105.85
    },
    "tierB": {
      "small": 1528,
      "medium": 1575,
      "large": 1675,
      "xl": 2094
    }
  },
  {
    "jobCode": "99TGSR10",
    "category": "Restoration",
    "name": "TGLOSS Windshield Polish-Front & Rear",
    "tierA": {
      "small": 2235,
      "medium": 2304.82,
      "large": 2580.55,
      "xl": 3312.8
    },
    "tierB": {
      "small": 2224,
      "medium": 2276,
      "large": 2554,
      "xl": 3288
    }
  }
];

export const VAS_PRICE_BY_JOB_CODE: Map<string, VasTreatmentPrice> = new Map(VAS_PRICE_LIST.map((t) => [t.jobCode, t]));

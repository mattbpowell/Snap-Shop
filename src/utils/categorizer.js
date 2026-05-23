/**
 * Deterministic keyword-based grocery categorizer.
 *
 * Rule order matters — first match wins. More specific phrases before
 * general single words (e.g. "almond milk" before "milk").
 *
 * To tune: add/move keywords in RULES. The review screen lets users
 * fix anything this gets wrong.
 */

const RULES = [
  {
    category: 'Frozen',
    keywords: [
      'frozen', 'ice cream', 'gelato', 'sorbet', 'popsicle', 'ice pop',
    ],
  },
  {
    category: 'Produce',
    keywords: [
      'apple', 'banana', 'orange', 'berry', 'strawberr', 'blueberr',
      'raspberr', 'blackberr', 'grape', 'melon', 'watermelon', 'cantaloupe',
      'peach', 'pear', 'plum', 'cherry', 'mango', 'pineapple', 'kiwi',
      'avocado', 'tomato', 'lettuce', 'spinach', 'kale', 'arugula',
      'broccoli', 'cauliflower', 'carrot', 'celery', 'cucumber', 'zucchini',
      'squash', 'onion', 'garlic', 'ginger', 'mushroom', 'sweet potato',
      'beet', 'radish', 'bell pepper', 'jalape', 'serrano', 'habanero',
      'lemon', 'lime', 'grapefruit', 'tangerine', 'clementine', 'asparagus',
      'artichoke', 'brussel', 'cabbage', 'eggplant', 'leek', 'scallion',
      'herb', 'basil', 'cilantro', 'parsley', 'mint', 'chive', 'dill',
      'rosemary', 'thyme', 'sage', 'produce',
    ],
  },
  {
    category: 'Meat & Seafood',
    keywords: [
      'chicken breast', 'chicken thigh', 'chicken wing', 'chicken drumstick',
      'ground beef', 'ground turkey', 'ground pork', 'ground chicken',
      'beef', 'chicken', 'pork', 'turkey', 'lamb', 'veal', 'bison',
      'steak', 'roast', 'chop', 'rib', 'bacon', 'ham', 'sausage',
      'hot dog', 'pepperoni', 'salami', 'prosciutto', 'deli meat', 'lunch meat',
      'salmon', 'tuna', 'shrimp', 'crab', 'lobster', 'scallop',
      'oyster', 'clam', 'tilapia', 'cod', 'halibut', 'sardine', 'anchovy',
      'mahi', 'trout', 'catfish', 'seafood', 'fish',
    ],
  },
  {
    category: 'Dairy & Eggs',
    keywords: [
      'egg', 'almond milk', 'oat milk', 'soy milk', 'coconut milk beverage',
      'whole milk', 'skim milk', '2% milk', '1% milk',
      'butter', 'cream cheese', 'sour cream', 'cottage cheese',
      'ricotta', 'mozzarella', 'cheddar', 'parmesan', 'parmigiano',
      'brie', 'gouda', 'feta', 'swiss cheese', 'provolone', 'havarti',
      'colby', 'pepper jack', 'american cheese', 'string cheese',
      'yogurt', 'greek yogurt', 'kefir',
      'heavy cream', 'heavy whipping cream', 'half and half',
      'whipped cream', 'cream', 'cheese', 'milk', 'dairy',
    ],
  },
  {
    category: 'Bakery',
    keywords: [
      'sourdough', 'baguette', 'ciabatta', 'focaccia', 'english muffin',
      'bagel', 'croissant', 'brioche', 'rye bread', 'whole wheat bread',
      'white bread', 'bread', 'pita', 'naan', 'flatbread', 'lavash',
      'dinner roll', 'hot dog bun', 'hamburger bun', 'slider bun',
      'muffin', 'scone', 'biscuit', 'donut', 'danish', 'pastry',
      'cake', 'cupcake', 'brownie', 'pie', 'tart',
    ],
  },
  {
    category: 'Beverages',
    keywords: [
      'orange juice', 'apple juice', 'cranberry juice', 'grape juice',
      'sparkling water', 'mineral water', 'tonic water', 'club soda',
      'iced tea', 'green tea', 'kombucha',
      'sports drink', 'gatorade', 'powerade', 'energy drink', 'red bull', 'monster',
      'coconut water', 'drink mix', 'hot chocolate', 'cider',
      'beer', 'wine', 'champagne', 'vodka', 'whiskey', 'rum', 'gin', 'tequila',
      'lemonade', 'juice', 'soda', 'tea', 'coffee', 'espresso', 'latte',
    ],
  },
  {
    category: 'Snacks',
    keywords: [
      'potato chip', 'tortilla chip', 'corn chip', 'pita chip', 'veggie chip',
      'chocolate bar', 'candy bar', 'candy', 'chocolate',
      'granola bar', 'protein bar', 'energy bar', 'KIND bar', 'clif bar',
      'trail mix', 'mixed nut', 'almond', 'cashew', 'peanut', 'walnut',
      'pecan', 'pistachio', 'macadamia', 'sunflower seed', 'pumpkin seed',
      'beef jerky', 'jerky', 'popcorn', 'pretzel', 'rice cake',
      'gummy', 'licorice', 'marshmallow', 'cracker', 'graham cracker',
      'fig newton', 'oreo', 'cookie',
    ],
  },
  {
    category: 'Household',
    keywords: [
      'paper towel', 'toilet paper', 'tissue', 'facial tissue', 'napkin',
      'paper plate', 'paper cup', 'paper bag',
      'zip lock', 'ziplock', 'ziploc', 'plastic bag', 'storage bag', 'freezer bag',
      'trash bag', 'garbage bag', 'bin liner',
      'aluminum foil', 'plastic wrap', 'parchment paper', 'wax paper',
      'dish soap', 'hand soap', 'bar soap', 'body wash', 'hand sanitizer',
      'shampoo', 'conditioner', 'hair mask',
      'toothpaste', 'toothbrush', 'toothpick', 'dental floss', 'mouthwash',
      'deodorant', 'antiperspirant',
      'razor', 'shaving cream', 'shaving gel',
      'cotton ball', 'cotton round', 'q-tip',
      'laundry detergent', 'laundry pod', 'fabric softener', 'dryer sheet',
      'bleach', 'all-purpose cleaner', 'bathroom cleaner', 'glass cleaner',
      'disinfectant', 'disinfecting wipe', 'cleaning wipe', 'sponge', 'scrubber',
      'dishwasher pod', 'dishwasher tab', 'dishwasher detergent', 'dishwasher',
      'copy paper', 'printer paper', 'light bulb', 'battery', 'candle',
      'air freshener', 'bug spray', 'sunscreen',
    ],
  },
  {
    category: 'Pantry & Dry Goods',
    keywords: [
      'spaghetti', 'linguine', 'fettuccine', 'penne', 'rigatoni', 'rotini',
      'orzo', 'lasagna', 'macaroni', 'ramen', 'udon', 'pasta',
      'jasmine rice', 'basmati rice', 'brown rice', 'white rice', 'rice',
      'quinoa', 'couscous', 'bulgur', 'farro', 'barley',
      'oat', 'oatmeal', 'rolled oat', 'steel cut oat', 'cream of wheat',
      'cereal', 'granola', 'muesli',
      'all-purpose flour', 'whole wheat flour', 'bread flour', 'almond flour',
      'cornmeal', 'cornstarch', 'flour',
      'white sugar', 'brown sugar', 'powdered sugar', 'sugar',
      'baking powder', 'baking soda', 'yeast', 'vanilla extract',
      'olive oil', 'extra virgin', 'vegetable oil', 'canola oil',
      'coconut oil', 'sesame oil', 'avocado oil',
      'apple cider vinegar', 'white vinegar', 'balsamic vinegar', 'vinegar',
      'soy sauce', 'tamari', 'worcestershire', 'fish sauce', 'oyster sauce',
      'hot sauce', 'sriracha', 'tabasco',
      'ketchup', 'mustard', 'dijon', 'mayonnaise', 'mayo',
      'relish', 'salsa', 'salad dressing', 'ranch', 'italian dressing',
      'marinara', 'tomato sauce', 'pasta sauce', 'alfredo sauce', 'pesto',
      'chicken broth', 'beef broth', 'vegetable broth', 'bone broth', 'broth', 'stock',
      'canned tomato', 'tomato paste', 'tomato puree', 'diced tomato',
      'canned bean', 'black bean', 'kidney bean', 'pinto bean', 'navy bean',
      'chickpea', 'garbanzo', 'lentil',
      'canned corn', 'canned pea', 'canned tuna', 'canned salmon', 'canned chicken',
      'peanut butter', 'almond butter', 'sunflower butter', 'tahini',
      'honey', 'maple syrup', 'agave', 'corn syrup',
      'jam', 'jelly', 'preserves', 'marmalade', 'nutella', 'hazelnut spread',
      'coconut milk', 'evaporated milk', 'condensed milk',
      'bread crumb', 'panko', 'stuffing mix',
      'black pepper', 'white pepper', 'red pepper flake', 'cayenne', 'paprika',
      'cumin', 'coriander', 'turmeric', 'cinnamon', 'nutmeg', 'clove',
      'oregano', 'basil', 'bay leaf', 'seasoning', 'spice', 'salt',
      'bouillon', 'soup mix', 'gravy mix',
    ],
  },
]

/**
 * Categorize a grocery item name using keyword rules.
 * Returns the first matching category, or 'Other' if nothing matches.
 * @param {string} name
 * @returns {string} category
 */
export function categorizeItem(name) {
  if (!name || typeof name !== 'string') return 'Other'
  const lower = name.toLowerCase()
  for (const rule of RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) {
      return rule.category
    }
  }
  return 'Other'
}

let menuData = {
  "deals": {
    "title": "Deals & Combos",
    "icon": "🏷️",
    "subtitle": "Delicious combos at special discounted prices",
    "items": [
      {
        "id": "d1",
        "name": "Breakfast Deal",
        "price": 3.99,
        "image": "images/menu/breakfast-deal.jpg",
        "description": "Any Breakfast Muffin + Tea or speciality Coffee (Save up to £1.00)",
        "veg": true,
        "tag": "Special Offer"
      },
      {
        "id": "d2",
        "name": "Classic Lunch Combo",
        "price": 5.99,
        "image": "images/menu/classic-lunch-combo.jpg",
        "description": "Any Toastie or Sandwich + Side of Fries + Soft Drink (Save up to £1.50)",
        "veg": false,
        "tag": "Lunch Special"
      },
      {
        "id": "d3",
        "name": "Gourmet Burger Meal Deal",
        "price": 7.99,
        "image": "images/menu/gourmet-burger-meal-deal.jpg",
        "description": "Any Gourmet Burger + Side of Fries + Soft Drink (Save up to £2.00)",
        "veg": false,
        "tag": "Best Value"
      },
      {
        "id": "d4",
        "name": "Loaded Cheesy Feast",
        "price": 6.99,
        "image": "images/menu/loaded-cheesy-feast.jpg",
        "description": "Cheesy Nachos or Loaded Fries + Any Soft Drink + Side Slaw (Save up to £1.80)",
        "veg": false,
        "tag": "Staff Choice"
      },
      {
        "id": "d6",
        "name": "Morning Glory Mega Breakfast",
        "price": 8.49,
        "image": "images/menu/morning-glory-mega-breakfast.jpg",
        "description": "Large or Veggie Breakfast + Any Hot Drink + Fresh Juice (Save up to £2.50)",
        "veg": false,
        "tag": "Morning Saver"
      },
      {
        "id": "d8",
        "name": "High Tea Sharing Deal for 2",
        "price": 12.99,
        "image": "images/menu/high-tea-sharing-deal-for-2.jpg",
        "description": "Any 2 Sandwiches or Toasties + 2 Hot Drinks + 2 French Fries (Save up to £5.00)",
        "veg": true,
        "tag": "Perfect Share"
      }
    ]
  },
  "breakfast": {
    "title": "Breakfast",
    "icon": "🍳",
    "items": [
      {
        "id": "b1",
        "name": "Small Breakfast",
        "price": 3.99,
        "image": "images/menu/small-breakfast.jpg",
        "description": "Two fried eggs, bacon, baked beans, hash browns & mushrooms",
        "veg": false
      },
      {
        "id": "b2",
        "name": "Large Breakfast",
        "price": 6.99,
        "image": "images/menu/large-breakfast.jpg",
        "description": "Two eggs, two sausages, bacon, mushrooms, hash browns, beans & toast",
        "veg": false
      },
      {
        "id": "b3",
        "name": "Vegetarian Breakfast",
        "price": 5.99,
        "image": "images/menu/vegetarian-breakfast.jpg",
        "description": "Eggs, veggie sausages, tomato, mushrooms, hash browns, beans & toast",
        "veg": true
      },
      {
        "id": "b4",
        "name": "Traditional Breakfast",
        "price": 5.99,
        "image": "images/menu/traditional-breakfast.jpg",
        "description": "Egg, bacon, sausage, beans, hash brown, tomato & toast",
        "veg": false
      },
      {
        "id": "b5",
        "name": "American Breakfast",
        "price": 6.99,
        "image": "images/menu/american-breakfast.jpg",
        "description": "Eggs, hash browns, bacon, sausages, pancakes & maple syrup",
        "veg": false
      },
      {
        "id": "b6",
        "name": "Add Coffee or Tea",
        "price": 1.5,
        "image": "images/menu/add-coffee-or-tea.jpg",
        "description": "Add any hot drink to your breakfast",
        "veg": true,
        "addon": true
      }
    ]
  },
  "toasties": {
    "title": "Toasties",
    "icon": "🥪",
    "subtitle": "Served with fries, salad & coleslaw",
    "items": [
      {
        "id": "t1",
        "name": "Just Cheese",
        "price": 3.49,
        "image": "images/menu/just-cheese.jpg",
        "description": "Melted cheese in toasted bread — simple & classic",
        "veg": true
      },
      {
        "id": "t2",
        "name": "Cheese & Tomato/Onion",
        "price": 3.99,
        "image": "images/menu/cheese-tomato.jpg",
        "description": "Cheese with fresh tomato or onion",
        "veg": true
      },
      {
        "id": "t3",
        "name": "Cheese & Mushroom",
        "price": 3.99,
        "image": "images/menu/cheese-mushroom.jpg",
        "description": "Cheese with sautéed mushrooms — rich & earthy",
        "veg": true
      },
      {
        "id": "t4",
        "name": "Ham & Cheese",
        "price": 4.49,
        "image": "images/menu/ham-cheese.jpg",
        "description": "Smoky ham with melted cheese",
        "veg": false
      },
      {
        "id": "t5",
        "name": "Tuna Mayo & Cheese",
        "price": 4.49,
        "image": "images/menu/tuna-mayo-cheese.jpg",
        "description": "Creamy tuna mayo with melted cheese",
        "veg": false
      },
      {
        "id": "t6",
        "name": "Chicken, Peppers & Cheese",
        "price": 4.49,
        "image": "images/menu/chicken-peppers-cheese.jpg",
        "description": "Juicy chicken, peppers & melted cheese",
        "veg": false
      },
      {
        "id": "t7",
        "name": "Chicken, Bacon & Cheese",
        "price": 4.49,
        "image": "images/menu/chicken-bacon-cheese.jpg",
        "description": "Chicken, crispy bacon & melted cheese",
        "veg": false
      }
    ]
  },
  "cheesy": {
    "title": "Feeling Cheesy",
    "icon": "🧀",
    "items": [
      {
        "id": "c1",
        "name": "Cheesy Nachos",
        "price": 3.49,
        "image": "images/menu/cheesy-nachos.jpg",
        "description": "Tortilla chips with melted cheese & jalapeños",
        "veg": true
      },
      {
        "id": "c2",
        "name": "Cheesy Fries",
        "price": 3.49,
        "image": "images/menu/cheesy-fries.jpg",
        "description": "Crispy fries with melted cheese sauce",
        "veg": true
      },
      {
        "id": "c3",
        "name": "Cheesy Bacon Loaded Fries",
        "price": 3.99,
        "image": "images/menu/cheesy-bacon-loaded-fries.jpg",
        "description": "Fries loaded with cheese and crispy bacon",
        "veg": false
      }
    ]
  },
  "burgers": {
    "title": "Gourmet Burgers",
    "icon": "🍔",
    "items": [
      {
        "id": "bu1",
        "name": "Quarter Pounder",
        "price": 4.49,
        "originalPrice": 6.50,
        "image": "images/menu/quarter-pounder.jpg",
        "description": "Juicy beef patty grilled to perfection",
        "veg": false,
        "options": [
          {
            "label": "Add Lettuce, Tomato, Onion & Pickle",
            "price": 1
          },
          {
            "label": "Add Bacon",
            "price": 0.99
          },
          {
            "label": "Add Burger Cheese",
            "price": 0.99
          }
        ]
      },
      {
        "id": "bu2",
        "name": "Double Quarter",
        "price": 8.00,
        "originalPrice": 12.00,
        "image": "images/menu/double-quarter.jpg",
        "description": "Two beef patties stacked with melted cheese",
        "veg": false,
        "options": [
          {
            "label": "Add Lettuce, Tomato, Onion & Pickle",
            "price": 1
          },
          {
            "label": "Add Bacon",
            "price": 0.99
          },
          {
            "label": "Add Burger Cheese",
            "price": 0.99
          }
        ]
      },
      {
        "id": "bu3",
        "name": "Veggie Burger",
        "price": 4.49,
        "originalPrice": 6.50,
        "image": "images/menu/veggie-burger.jpg",
        "description": "Crispy plant-based patty with fresh salad",
        "veg": true,
        "options": [
          {
            "label": "Add Lettuce, Tomato, Onion & Pickle",
            "price": 1
          },
          {
            "label": "Add Burger Cheese",
            "price": 0.99
          }
        ]
      },
      {
        "id": "bu4",
        "name": "Chicken Fillet",
        "price": 4.99,
        "originalPrice": 7.50,
        "image": "images/menu/chicken-fillet.jpg",
        "description": "Highlighting crispy chicken fillet in a soft bun",
        "veg": false,
        "options": [
          {
            "label": "Add Bacon",
            "price": 0.99
          },
          {
            "label": "Add Burger Cheese",
            "price": 0.99
          }
        ]
      },
      {
        "id": "bu5",
        "name": "Spicy Chicken Fillet",
        "price": 5.49,
        "originalPrice": 8.00,
        "image": "images/menu/spicy-chicken-fillet.jpg",
        "description": "Crispy chicken with a spicy kick",
        "veg": false,
        "options": [
          {
            "label": "Add Bacon",
            "price": 0.99
          },
          {
            "label": "Add Burger Cheese",
            "price": 0.99
          }
        ]
      }
    ]
  },
  "muffins": {
    "title": "Breakfast Muffin Deals",
    "icon": "🥐",
    "items": [
      {
        "id": "m1",
        "name": "Egg & Cheese Muffin",
        "price": 2.99,
        "image": "images/menu/egg-cheese-muffin.jpg",
        "description": "Fried egg, American cheese in an English muffin",
        "veg": true
      },
      {
        "id": "m2",
        "name": "Egg & Bacon Muffin",
        "price": 3.49,
        "image": "images/menu/egg-bacon-muffin.jpg",
        "description": "Fried egg, bacon & melted cheese",
        "veg": false
      },
      {
        "id": "m3",
        "name": "Egg & Sausage Muffin",
        "price": 3.49,
        "image": "images/menu/egg-sausage-muffin.jpg",
        "description": "Fried egg, sausage patty & melted cheese",
        "veg": false
      },
      {
        "id": "m4",
        "name": "Egg & Vegetarian Sausage Muffin",
        "price": 3.49,
        "image": "images/menu/egg-vegetarian-sausage-muffin.jpg",
        "description": "Fried egg, vegan sausage & melted cheese",
        "veg": true
      },
      {
        "id": "m5",
        "name": "Breakfast Muffin",
        "price": 3.49,
        "image": "images/menu/breakfast-muffin.jpg",
        "description": "Egg, sausage, bacon & cheese in an English muffin",
        "veg": false
      },
      {
        "id": "m6",
        "name": "Soup of the Day",
        "price": 4.99,
        "image": "images/menu/soup-of-the-day.jpg",
        "description": "Freshly made soup — see our specials board",
        "veg": true
      }
    ]
  },
  "sandwiches": {
    "title": "Sandwiches",
    "icon": "🥙",
    "subtitle": "Brown or white bread, with coleslaw & crisps",
    "items": [
      {
        "id": "s1",
        "name": "Cheese, Tomato & Onion",
        "price": 3.99,
        "image": "images/menu/cheese-tomato-onion.jpg",
        "description": "Classic veggie sandwich",
        "veg": true
      },
      {
        "id": "s2",
        "name": "Egg Mayonnaise",
        "price": 3.99,
        "image": "images/menu/egg-mayonnaise.jpg",
        "description": "Creamy egg mayo",
        "veg": true
      },
      {
        "id": "s3",
        "name": "BLT on Toasted Bread",
        "price": 3.99,
        "image": "images/menu/blt-on-toasted-bread.jpg",
        "description": "Bacon, lettuce & tomato",
        "veg": false
      },
      {
        "id": "s4",
        "name": "Ham & Cheese",
        "price": 3.99,
        "image": "images/menu/ham-cheese.jpg",
        "description": "Ham and cheese",
        "veg": false
      },
      {
        "id": "s5",
        "name": "Roast Beef & Mustard",
        "price": 4.49,
        "image": "images/menu/roast-beef-mustard.jpg",
        "description": "Thick-cut roast beef with mustard",
        "veg": false
      },
      {
        "id": "s6",
        "name": "BBQ Chicken",
        "price": 4.49,
        "image": "images/menu/bbq-chicken.jpg",
        "description": "Grilled chicken with BBQ sauce",
        "veg": false
      },
      {
        "id": "s7",
        "name": "Chicken & Bacon Mayo",
        "price": 4.49,
        "image": "images/menu/chicken-bacon-mayo.jpg",
        "description": "Chicken, crispy bacon and mayo",
        "veg": false
      },
      {
        "id": "s8",
        "name": "Tuna Mayo",
        "price": 4.49,
        "image": "images/menu/tuna-mayo.jpg",
        "description": "Creamy tuna mayo",
        "veg": false
      },
      {
        "id": "s9",
        "name": "Prawn Mayo",
        "price": 4.49,
        "image": "images/menu/prawn-mayo.jpg",
        "description": "Prawn marie rose with lettuce",
        "veg": false
      }
    ]
  },
  "sides": {
    "title": "Sides",
    "icon": "🥗",
    "items": [
      {
        "id": "si1",
        "name": "Side Salad",
        "price": 1.49,
        "image": "images/menu/side-salad.jpg",
        "description": "Fresh mixed greens with light dressing",
        "veg": true
      },
      {
        "id": "si2",
        "name": "Homemade Slaw",
        "price": 0.99,
        "image": "images/menu/homemade-slaw.jpg",
        "description": "Shredded cabbage in creamy dressing",
        "veg": true
      },
      {
        "id": "si3",
        "name": "Side of Fries",
        "price": 1.99,
        "image": "images/menu/side-of-fries.jpg",
        "description": "Golden fried potato sticks",
        "veg": true
      }
    ]
  },
  "hotdrinks": {
    "title": "Hot Beverages",
    "icon": "☕",
    "items": [
      {
        "id": "hd1",
        "name": "Espresso",
        "price": 1.8,
        "image": "images/menu/espresso.jpg",
        "description": "Single or double shot"
      },
      {
        "id": "hd2",
        "name": "Americano",
        "price": 2.2,
        "image": "images/menu/americano.jpg",
        "description": "Espresso with hot water"
      },
      {
        "id": "hd3",
        "name": "Cappuccino",
        "price": 2.2,
        "image": "images/menu/cappuccino.jpg",
        "description": "Espresso with steamed milk foam"
      },
      {
        "id": "hd4",
        "name": "Latte",
        "price": 2.8,
        "image": "images/menu/latte.jpg",
        "description": "Espresso with steamed milk and latte art"
      },
      {
        "id": "hd5",
        "name": "Flat White",
        "price": 3,
        "image": "images/menu/flat-white.jpg",
        "description": "Double espresso with velvety micro-foam"
      },
      {
        "id": "hd6",
        "name": "Mocha",
        "price": 3.2,
        "image": "images/menu/mocha.jpg",
        "description": "Espresso with chocolate and steamed milk"
      },
      {
        "id": "hd7",
        "name": "Filter Coffee",
        "price": 2.2,
        "image": "images/menu/filter-coffee.jpg",
        "description": "Freshly brewed filter coffee"
      },
      {
        "id": "hd8",
        "name": "English Breakfast Tea",
        "price": 2.2,
        "image": "images/menu/english-breakfast-tea.jpg",
        "description": "Classic breakfast tea"
      },
      {
        "id": "hd9",
        "name": "Earl Grey / Herbal Tea",
        "price": 2.2,
        "image": "images/menu/earl-grey-herbal-tea.jpg",
        "description": "Earl Grey or herbal infusion"
      },
      {
        "id": "hd10",
        "name": "Green Tea",
        "price": 1.8,
        "image": "images/menu/green-tea.jpg",
        "description": "Delicate green tea"
      }
    ]
  },
  "softdrinks": {
    "title": "Soft Drinks",
    "icon": "🥤",
    "items": [
      {
        "id": "sd1",
        "name": "Cola",
        "price": 1.8,
        "image": "images/menu/cola.jpg",
        "description": "Classic cola with ice"
      },
      {
        "id": "sd2",
        "name": "Diet Cola",
        "price": 1.8,
        "image": "images/menu/diet-cola.jpg",
        "description": "Diet cola with ice"
      },
      {
        "id": "sd3",
        "name": "Lemonade",
        "price": 2,
        "image": "images/menu/lemonade.jpg",
        "description": "Sparkling lemonade with lemon"
      },
      {
        "id": "sd4",
        "name": "Ginger Ale",
        "price": 2.2,
        "image": "images/menu/ginger-ale.jpg",
        "description": "Crisp ginger ale with ice"
      },
      {
        "id": "sd5",
        "name": "Fresh Lime Soda",
        "price": 2.2,
        "image": "images/menu/fresh-lime-soda.jpg",
        "description": "Fresh lime juice with soda water"
      },
      {
        "id": "sd6",
        "name": "Iced Tea",
        "price": 2.5,
        "image": "images/menu/iced-tea.jpg",
        "description": "Chilled sweetened iced tea"
      },
      {
        "id": "sd7",
        "name": "Fresh Juices",
        "price": 3,
        "image": "images/menu/fresh-juices.jpg",
        "description": "Orange, apple or mango — freshly squeezed"
      }
    ]
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = menuData;
}

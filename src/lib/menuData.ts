import { MenuItem } from "./types";

// Default menu categories & items seeded into local storage on first run.
// Based on the 7 Spices Restaurant menu structure.

export const DEFAULT_CATEGORIES: { name: string }[] = [
  { name: "Soup Sensation" },
  { name: "Veg Starter" },
  { name: "Non-Veg Starter" },
  { name: "Grill Garden" },
  { name: "Sizzler" },
  { name: "Indian Breads" },
  { name: "Indian Rice" },
  { name: "Biryani" },
  { name: "Chinese Rice" },
  { name: "Noodles" },
  { name: "Chinese Veg Side Dish" },
  { name: "Chinese Non-Veg Side Dish" },
  { name: "Prawns" },
  { name: "Chicken Corner" },
  { name: "Mutton Paradise" },
  { name: "Veggie Paradise" },
  { name: "Fish" },
  { name: "Salad" },
  { name: "Combo" },
  { name: "Mocktail" },
  { name: "Dessert" },
  { name: "Thali Junction" },
  { name: "Bengali" },
];

export const DEFAULT_ITEMS: Omit<MenuItem, "id" | "categoryId">[] = [
  // Soup Sensation
  { name: "Cream of Tomato Soup", price: 120, veg: true, available: true },
  { name: "Cream of Mushroom Soup", price: 140, veg: true, available: true },
  { name: "Sweet Corn Veg Soup", price: 130, veg: true, available: true },
  { name: "Sweet Corn Chicken Soup", price: 160, veg: false, available: true },
  { name: "Hot & Sour Veg Soup", price: 130, veg: true, available: true },
  { name: "Hot & Sour Chicken Soup", price: 160, veg: false, available: true },
  { name: "Manchow Veg Soup", price: 140, veg: true, available: true },
  { name: "Manchow Chicken Soup", price: 170, veg: false, available: true },
  { name: "Lemon Coriander Chicken Soup", price: 170, veg: false, available: true },

  // Veg Starter
  { name: "Paneer Tikka", price: 250, veg: true, available: true },
  { name: "Paneer Chilli", price: 240, veg: true, available: true },
  { name: "Paneer Manchurian", price: 240, veg: true, available: true },
  { name: "Paneer 65", price: 240, veg: true, available: true },
  { name: "Paneer Crispy", price: 260, veg: true, available: true },
  { name: "Mushroom Chilli", price: 230, veg: true, available: true },
  { name: "Mushroom 65", price: 230, veg: true, available: true },
  { name: "Veg Manchurian", price: 200, veg: true, available: true },
  { name: "Veg 65", price: 200, veg: true, available: true },
  { name: "Crispy Corn", price: 200, veg: true, available: true },
  { name: "Honey Chilli Potato", price: 190, veg: true, available: true },
  { name: "Baby Corn Chilli", price: 220, veg: true, available: true },
  { name: "French Fries", price: 160, veg: true, available: true },
  { name: "Aloo 65", price: 170, veg: true, available: true },
  { name: "Gobi Manchurian", price: 200, veg: true, available: true },
  { name: "Spring Roll Veg", price: 180, veg: true, available: true },

  // Non-Veg Starter
  { name: "Chicken Tikka", price: 280, veg: false, available: true },
  { name: "Chicken Malai Tikka", price: 300, veg: false, available: true },
  { name: "Chicken Hariyali Tikka", price: 290, veg: false, available: true },
  { name: "Chicken Achari Tikka", price: 290, veg: false, available: true },
  { name: "Chicken Tandoori (Half)", price: 260, veg: false, available: true },
  { name: "Chicken Tandoori (Full)", price: 480, veg: false, available: true },
  { name: "Chicken Chilli", price: 270, veg: false, available: true },
  { name: "Chicken Manchurian", price: 270, veg: false, available: true },
  { name: "Chicken 65", price: 270, veg: false, available: true },
  { name: "Chicken Lollipop", price: 280, veg: false, available: true },
  { name: "Dragon Chicken", price: 290, veg: false, available: true },
  { name: "Honey Chilli Chicken", price: 290, veg: false, available: true },
  { name: "Chicken Crispy", price: 290, veg: false, available: true },
  { name: "Chicken Salt & Pepper", price: 290, veg: false, available: true },

  // Grill Garden
  { name: "Grilled Paneer Steak", price: 320, veg: true, available: true },
  { name: "Grilled Mushroom", price: 280, veg: true, available: true },
  { name: "Grilled Veg Platter", price: 360, veg: true, available: true },
  { name: "Grilled Chicken Steak", price: 380, veg: false, available: true },
  { name: "Grilled Fish", price: 360, veg: false, available: true },
  { name: "Grilled Prawns", price: 420, veg: false, available: true },

  // Sizzler
  { name: "Veg Sizzler", price: 350, veg: true, available: true },
  { name: "Paneer Sizzler", price: 380, veg: true, available: true },
  { name: "Mushroom Sizzler", price: 360, veg: true, available: true },
  { name: "Chicken Sizzler", price: 420, veg: false, available: true },
  { name: "Fish Sizzler", price: 400, veg: false, available: true },
  { name: "Prawn Sizzler", price: 460, veg: false, available: true },

  // Indian Breads
  { name: "Tandoori Roti", price: 40, veg: true, available: true },
  { name: "Butter Roti", price: 45, veg: true, available: true },
  { name: "Plain Naan", price: 60, veg: true, available: true },
  { name: "Butter Naan", price: 70, veg: true, available: true },
  { name: "Garlic Naan", price: 80, veg: true, available: true },
  { name: "Cheese Garlic Naan", price: 110, veg: true, available: true },
  { name: "Stuffed Naan (Paneer)", price: 120, veg: true, available: true },
  { name: "Laccha Paratha", price: 70, veg: true, available: true },
  { name: "Aloo Paratha", price: 90, veg: true, available: true },
  { name: "Paneer Paratha", price: 110, veg: true, available: true },
  { name: "Missi Roti", price: 80, veg: true, available: true },

  // Indian Rice
  { name: "Steam Rice", price: 130, veg: true, available: true },
  { name: "Jeera Rice", price: 160, veg: true, available: true },
  { name: "Veg Pulao", price: 180, veg: true, available: true },
  { name: "Paneer Pulao", price: 220, veg: true, available: true },
  { name: "Chicken Pulao", price: 260, veg: false, available: true },
  { name: "Mutton Pulao", price: 320, veg: false, available: true },

  // Biryani
  { name: "Veg Biryani", price: 220, veg: true, available: true },
  { name: "Paneer Biryani", price: 260, veg: true, available: true },
  { name: "Mushroom Biryani", price: 240, veg: true, available: true },
  { name: "Chicken Biryani", price: 290, veg: false, available: true },
  { name: "Chicken Dum Biryani", price: 310, veg: false, available: true },
  { name: "Mutton Biryani", price: 360, veg: false, available: true },
  { name: "Egg Biryani", price: 230, veg: false, available: true },
  { name: "Fish Biryani", price: 300, veg: false, available: true },
  { name: "Prawn Biryani", price: 360, veg: false, available: true },

  // Chinese Rice
  { name: "Veg Fried Rice", price: 190, veg: true, available: true },
  { name: "Paneer Fried Rice", price: 230, veg: true, available: true },
  { name: "Mushroom Fried Rice", price: 210, veg: true, available: true },
  { name: "Egg Fried Rice", price: 210, veg: false, available: true },
  { name: "Chicken Fried Rice", price: 250, veg: false, available: true },
  { name: "Prawn Fried Rice", price: 290, veg: false, available: true },
  { name: "Schezwan Veg Fried Rice", price: 210, veg: true, available: true },
  { name: "Schezwan Chicken Fried Rice", price: 270, veg: false, available: true },
  { name: "Triple Schezwan Rice", price: 320, veg: false, available: true },

  // Noodles
  { name: "Veg Hakka Noodles", price: 190, veg: true, available: true },
  { name: "Paneer Hakka Noodles", price: 230, veg: true, available: true },
  { name: "Egg Hakka Noodles", price: 210, veg: false, available: true },
  { name: "Chicken Hakka Noodles", price: 250, veg: false, available: true },
  { name: "Schezwan Veg Noodles", price: 210, veg: true, available: true },
  { name: "Schezwan Chicken Noodles", price: 270, veg: false, available: true },
  { name: "Singapore Noodles", price: 230, veg: true, available: true },

  // Chinese Veg Side Dish
  { name: "Veg Manchurian Gravy", price: 220, veg: true, available: true },
  { name: "Paneer Manchurian Gravy", price: 250, veg: true, available: true },
  { name: "Chilli Paneer Gravy", price: 250, veg: true, available: true },
  { name: "Mushroom Chilli Gravy", price: 230, veg: true, available: true },
  { name: "Mixed Veg in Schezwan Sauce", price: 230, veg: true, available: true },
  { name: "Stir Fried Veg with Garlic Sauce", price: 220, veg: true, available: true },

  // Chinese Non-Veg Side Dish
  { name: "Chilli Chicken Gravy", price: 280, veg: false, available: true },
  { name: "Chicken Manchurian Gravy", price: 280, veg: false, available: true },
  { name: "Dragon Chicken Gravy", price: 290, veg: false, available: true },
  { name: "Schezwan Chicken", price: 290, veg: false, available: true },
  { name: "Sweet & Sour Chicken", price: 300, veg: false, available: true },
  { name: "Chicken in Black Bean Sauce", price: 300, veg: false, available: true },

  // Prawns
  { name: "Prawn Curry", price: 380, veg: false, available: true },
  { name: "Prawn Masala", price: 390, veg: false, available: true },
  { name: "Prawn Fry", price: 380, veg: false, available: true },
  { name: "Butter Garlic Prawn", price: 410, veg: false, available: true },
  { name: "Prawn Chilli Gravy", price: 390, veg: false, available: true },
  { name: "Tandoori Prawn", price: 420, veg: false, available: true },

  // Chicken Corner
  { name: "Butter Chicken", price: 290, veg: false, available: true },
  { name: "Chicken Kadhai", price: 290, veg: false, available: true },
  { name: "Chicken Curry", price: 270, veg: false, available: true },
  { name: "Chicken Masala", price: 280, veg: false, available: true },
  { name: "Chicken Rogan Josh", price: 300, veg: false, available: true },
  { name: "Chicken Do Pyaza", price: 290, veg: false, available: true },
  { name: "Chicken Handi", price: 300, veg: false, available: true },
  { name: "Chicken Changezi", price: 310, veg: false, available: true },
  { name: "Chicken Hyderabadi", price: 310, veg: false, available: true },
  { name: "Chicken Tikka Masala", price: 300, veg: false, available: true },

  // Mutton Paradise
  { name: "Mutton Curry", price: 360, veg: false, available: true },
  { name: "Mutton Masala", price: 370, veg: false, available: true },
  { name: "Mutton Rogan Josh", price: 390, veg: false, available: true },
  { name: "Mutton Kadhai", price: 380, veg: false, available: true },
  { name: "Mutton Do Pyaza", price: 370, veg: false, available: true },
  { name: "Mutton Handi", price: 390, veg: false, available: true },
  { name: "Mutton Keema", price: 380, veg: false, available: true },
  { name: "Mutton Changezi", price: 400, veg: false, available: true },

  // Veggie Paradise
  { name: "Paneer Butter Masala", price: 260, veg: true, available: true },
  { name: "Paneer Kadhai", price: 260, veg: true, available: true },
  { name: "Paneer Do Pyaza", price: 260, veg: true, available: true },
  { name: "Paneer Tikka Masala", price: 270, veg: true, available: true },
  { name: "Shahi Paneer", price: 270, veg: true, available: true },
  { name: "Kadhai Paneer", price: 260, veg: true, available: true },
  { name: "Mushroom Masala", price: 240, veg: true, available: true },
  { name: "Mushroom Do Pyaza", price: 240, veg: true, available: true },
  { name: "Veg Korma", price: 230, veg: true, available: true },
  { name: "Mix Veg Curry", price: 210, veg: true, available: true },
  { name: "Dal Makhani", price: 200, veg: true, available: true },
  { name: "Dal Tadka", price: 180, veg: true, available: true },
  { name: "Palak Paneer", price: 250, veg: true, available: true },
  { name: "Aloo Gobi", price: 190, veg: true, available: true },
  { name: "Aloo Matar", price: 180, veg: true, available: true },
  { name: "Chana Masala", price: 190, veg: true, available: true },

  // Fish
  { name: "Rohu Fish Curry", price: 290, veg: false, available: true },
  { name: "Katla Fish Curry", price: 310, veg: false, available: true },
  { name: "Fish Masala", price: 300, veg: false, available: true },
  { name: "Fish Fry", price: 290, veg: false, available: true },
  { name: "Bengali Fish Curry", price: 300, veg: false, available: true },
  { name: "Fish Tikka", price: 320, veg: false, available: true },

  // Salad
  { name: "Green Salad", price: 90, veg: true, available: true },
  { name: "Caesar Salad", price: 160, veg: true, available: true },
  { name: "Greek Salad", price: 180, veg: true, available: true },
  { name: "Russian Salad", price: 150, veg: true, available: true },
  { name: "Chicken Salad", price: 200, veg: false, available: true },

  // Combo
  { name: "Veg Combo (Meal)", price: 280, veg: true, available: true },
  { name: "Non-Veg Combo (Meal)", price: 360, veg: false, available: true },
  { name: "Family Veg Combo", price: 650, veg: true, available: true },
  { name: "Family Non-Veg Combo", price: 850, veg: false, available: true },
  { name: "Couple Combo", price: 480, veg: false, available: true },

  // Mocktail
  { name: "Virgin Mojito", price: 130, veg: true, available: true },
  { name: "Blue Lagoon", price: 140, veg: true, available: true },
  { name: "Green Apple Fizz", price: 140, veg: true, available: true },
  { name: "Strawberry Punch", price: 150, veg: true, available: true },
  { name: "Mango Smoothie", price: 150, veg: true, available: true },
  { name: "Oreo Shake", price: 160, veg: true, available: true },
  { name: "Cold Coffee", price: 140, veg: true, available: true },
  { name: "Fresh Lime Soda", price: 90, veg: true, available: true },
  { name: "Watermelon Juice", price: 110, veg: true, available: true },

  // Dessert
  { name: "Gulab Jamun (2 pcs)", price: 80, veg: true, available: true },
  { name: "Rasgulla (2 pcs)", price: 80, veg: true, available: true },
  { name: "Ice Cream Vanilla", price: 90, veg: true, available: true },
  { name: "Ice Cream Chocolate", price: 100, veg: true, available: true },
  { name: "Ice Cream Strawberry", price: 100, veg: true, available: true },
  { name: "Brownie with Ice Cream", price: 180, veg: true, available: true },
  { name: "Gajar Halwa", price: 130, veg: true, available: true },

  // Thali Junction
  { name: "Veg Thali", price: 250, veg: true, available: true },
  { name: "Special Veg Thali", price: 320, veg: true, available: true },
  { name: "Chicken Thali", price: 340, veg: false, available: true },
  { name: "Mutton Thali", price: 420, veg: false, available: true },
  { name: "Fish Thali", price: 350, veg: false, available: true },

  // Bengali
  { name: "Luchi", price: 50, veg: true, available: true, isBengali: true },
  { name: "Koraishutir Kochuri", price: 70, veg: true, available: true, isBengali: true },
  { name: "Beguni", price: 60, veg: true, available: true, isBengali: true },
  { name: "Aloor Dom", price: 160, veg: true, available: true, isBengali: true },
  { name: "Chingri Malai Curry", price: 380, veg: false, available: true, isBengali: true },
  { name: "Ilish Bhapa", price: 420, veg: false, available: true, isBengali: true },
  { name: "Ilish Maach Bhaja", price: 380, veg: false, available: true, isBengali: true },
  { name: "Sorse Ilish", price: 420, veg: false, available: true, isBengali: true },
  { name: "Doi Maach", price: 350, veg: false, available: true, isBengali: true },
  { name: "Kosha Mangsho", price: 380, veg: false, available: true, isBengali: true },
  { name: "Chhanar Dalna", price: 220, veg: true, available: true, isBengali: true },
  { name: "Shukto", price: 180, veg: true, available: true, isBengali: true },
  { name: "Posto Bora", price: 160, veg: true, available: true, isBengali: true },
  { name: "Mishti Doi", price: 80, veg: true, available: true, isBengali: true },
  { name: "Sandesh", price: 90, veg: true, available: true, isBengali: true },
];

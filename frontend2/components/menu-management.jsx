"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Search, Plus, Edit, Trash2, DollarSign, Clock } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import axios from "axios"


export function MenuManagement() {
  const [searchTerm, setSearchTerm] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [categories, setCategories] = useState([])

  const [menuItems, setMenuItems] = useState([
    {
      id: "1",
      name: "Classic Burger",
      description: "Juicy beef patty with lettuce, tomato, onion, and our special sauce",
      price: 15.99,
      category: "Main Course",
      available: true,
      image: "https://example.com/burger.jpg",
      optionGroups: [
        {
          id: "1",
          title: "Size",
          options: [
            { id: "1", name: "Small", priceDelta: 0 },
            { id: "2", name: "Medium", priceDelta: 2 },
            { id: "3", name: "Large", priceDelta: 4 },
          ],
        }
      ]
    }
  ])

  const getMenuItems= async() => {
    try{
      const response = await axios.get("http://localhost:5000/api/menu/", { withCredentials: true })
      console.log("Fetched menu items:", response.data)
      setMenuItems(response.data)
    } catch (error) {
      console.error("Error fetching menu items:", error)
    }
  }

  const getCategories = async () => {
    try {
      const response = await axios.get("http://localhost:5000/api/category/all", { withCredentials: true })
      setCategories(response.data)
    }
    catch (error) {
      console.error("Error fetching categories:", error)
    }
  }

  useEffect(() => {
    getMenuItems()
    getCategories()
  }, [])

  const [newItem, setNewItem] = useState({
    name: "",
    description: "",
    price: 0,
    category: "",
    isAvailable: true,
    preparationTime: 10,
    ingredients: [],
    allergens: [],
  })
  const commonAllergens = ["Gluten", "Dairy", "Eggs", "Nuts", "Soy", "Fish", "Shellfish"]

  const filteredItems = menuItems.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = categoryFilter === "all" || item.category.name === categoryFilter
    return matchesSearch && matchesCategory
  })

  const handleAddItem = () => {
    if (newItem.name && newItem.price && newItem.category) {
      const item= {
        id: Date.now().toString(),
        name: newItem.name,
        description: newItem.description || "",
        price: newItem.price,
        category: newItem.category,
        isAvailable: newItem.isAvailable ?? true,
        preparationTime: newItem.preparationTime || 10,
        ingredients: newItem.ingredients || [],
        allergens: newItem.allergens || [],
      }
      setMenuItems([...menuItems, item])
      setNewItem({
        name: "",
        description: "",
        price: 0,
        category: "",
        isAvailable: true,
        preparationTime: 10,
        ingredients: [],
        allergens: [],
      })
      setIsAddDialogOpen(false)
    }
  }

  const handleEditItem = () => {
    if (selectedItem) {
      setMenuItems(menuItems.map((item) => (item.id === selectedItem.id ? selectedItem : item)))
      setIsEditDialogOpen(false)
      setSelectedItem(null)
    }
  }

  const handleDeleteItem = (id) => {
    setMenuItems(menuItems.filter((item) => item.id !== id))
  }

  const toggleAvailability = (id) => {
    setMenuItems(menuItems.map((item) => (item.id === id ? { ...item, isAvailable: !item.isAvailable } : item)))
  }

  const categoryStats = categories.map((category) => ({
    name: category.name,
    count: menuItems.filter((item) => item.category.name === category.name).length,
    available: menuItems.filter((item) => item.category.name === category.name && item.available).length,
  }))

  const addOptionGroup = () => {
    setNewItem({
      ...newItem,
      optionGroups: [
        ...newItem.optionGroups,
        { title: "", required: false, multiple: false, options: [] },
      ],
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-700">Menu Management</h1>
          <p className="text-gray-600 mt-2">Craft your menu - Add, edit, or remove items easily</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
      <DialogTrigger asChild>
        <Button className="bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="h-4 w-4 mr-2" />
          Add Menu Item
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Menu Item</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Item Name</Label>
              <Input
                id="name"
                value={newItem.name}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                placeholder="Enter item name"
              />
            </div>
            <div>
              <Label htmlFor="price">Price ($)</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                value={newItem.price}
                onChange={(e) => setNewItem({ ...newItem, price: parseFloat(e.target.value) })}
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={newItem.description}
              onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
              placeholder="Describe the menu item"
              rows={3}
            />
          </div>

          {/* Category */}
          <div>
            <Label htmlFor="category">Category</Label>
            <Select
              value={newItem.category}
              onValueChange={(value) => setNewItem({ ...newItem, category: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id.toString()}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Availability */}
          <div className="flex items-center space-x-2">
            <Switch
              id="available"
              checked={newItem.isAvailable}
              onCheckedChange={(checked) => setNewItem({ ...newItem, isAvailable: checked })}
            />
            <Label htmlFor="available">Available for ordering</Label>
          </div>

          {/* Option Groups */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="font-semibold">Option Groups</Label>
              <Button variant="outline" size="sm" onClick={addOptionGroup}>
                + Add Group
              </Button>
            </div>

            {newItem.optionGroups.map((group, gIndex) => (
              <div key={gIndex} className="border p-3 rounded-md space-y-2">
                <Input
                  placeholder="Group Title"
                  value={group.title}
                  onChange={(e) => updateOptionGroup(gIndex, "title", e.target.value)}
                />

                <div className="flex items-center space-x-4">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={group.required}
                      onChange={(e) => updateOptionGroup(gIndex, "required", e.target.checked)}
                    />
                    <span>Required</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={group.multiple}
                      onChange={(e) => updateOptionGroup(gIndex, "multiple", e.target.checked)}
                    />
                    <span>Allow Multiple</span>
                  </label>
                </div>

                {/* Options */}
                <div className="space-y-2">
                  {group.options.map((opt, oIndex) => (
                    <div key={oIndex} className="flex items-center space-x-2">
                      <Input
                        placeholder="Option name"
                        value={opt.name}
                        onChange={(e) => updateOption(gIndex, oIndex, "name", e.target.value)}
                      />
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Price delta"
                        value={opt.priceDelta}
                        onChange={(e) =>
                          updateOption(gIndex, oIndex, "priceDelta", parseFloat(e.target.value))
                        }
                        className="w-28"
                      />
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => removeOption(gIndex, oIndex)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => addOption(gIndex)}>
                    + Add Option
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                handleAddItem(newItem);
                setIsAddDialogOpen(false);
              }}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Add Item
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
      </div>

      {/* Category Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {categoryStats.map((stat) => (
          <Card key={stat.name} className="border-0 shadow-md">
            <CardContent className="p-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{stat.count}</div>
                <div className="text-sm text-gray-600">{stat.name}</div>
                <div className="text-xs text-green-600 mt-1">{stat.available} available</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search menu items..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full md:w-48 border-gray-300 focus:border-blue-500 focus:ring-blue-500">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.name}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Menu Items Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredItems.map((item) => (
          <Card key={item.id} className="border-0 shadow-md hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900 text-lg">{item.name}</h3>
                  <Badge variant="outline" className="mt-1 text-xs">
                    {item.category.name}
                  </Badge>
                </div>
                <div className="flex items-center space-x-1">
                  <Switch checked={item.available} onCheckedChange={() => toggleAvailability(item.id)} size="sm" />
                </div>
              </div>

              <p className="text-gray-600 text-sm mb-4 line-clamp-2">{item.description}</p>

              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center text-green-600">
                    <DollarSign className="h-4 w-4" />
                    <span className="font-bold">{item.price.toFixed(2)}</span>
                  </div>
                </div>
                <Badge variant={item.available ? "default" : "secondary"} className="text-xs">
                  {item.available ? "Available" : "Unavailable"}
                </Badge>
              </div>

                            {item.optionGroups && item.optionGroups.length > 0 && (
                  <div className="space-y-4 mb-4">
                    {item.optionGroups.map((group) => (
                      <div key={group.id} className="border p-3 rounded-md">
                        {/* Group Title */}
                        <Label className="font-semibold text-lg">{group.title}</Label>
                        {group.required && (
                          <span className="ml-2 text-red-500 text-sm">(Required)</span>
                        )}

                        <div className="mt-2 space-y-2">
                          {group.options.map((option) => (
                            <div key={option.id} className="flex items-center space-x-2">
                              {/* If multiple -> checkbox else -> radio */}
                              {group.multiple ? (
                                <p
                                  type="checkbox"
                                  id={`group-${group.id}-option-${option.id}`}
                                  name={`group-${group.id}`}
                                  value={option.id}
                                  className="cursor-pointer"
                                />
                              ) : (
                                <p
                                  type="radio"
                                  id={`group-${group.id}-option-${option.id}`}
                                  name={`group-${group.id}`}
                                  value={option.id}
                                  className="cursor-pointer"
                                />
                              )}
                              <Label
                                htmlFor={`group-${group.id}-option-${option.id}`}
                                className="cursor-pointer"
                              >
                                {option.name}{" "}
                                {option.priceDelta !== 0 && (
                                  <span className="text-gray-500 text-sm">
                                    {option.priceDelta > 0
                                      ? `+₹${option.priceDelta}`
                                      : `-₹${Math.abs(option.priceDelta)}`}
                                  </span>
                                )}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}


              <div className="flex space-x-2">
                <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 bg-transparent"
                      onClick={() => setSelectedItem(item)}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Edit Menu Item</DialogTitle>
                    </DialogHeader>
                    {selectedItem && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="edit-name">Item Name</Label>
                            <Input
                              id="edit-name"
                              value={selectedItem.name}
                              onChange={(e) => setSelectedItem({ ...selectedItem, name: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label htmlFor="edit-price">Price ($)</Label>
                            <Input
                              id="edit-price"
                              type="number"
                              step="0.01"
                              value={selectedItem.price}
                              onChange={(e) =>
                                setSelectedItem({ ...selectedItem, price: Number.parseFloat(e.target.value) })
                              }
                            />
                          </div>
                        </div>

                        <div>
                          <Label htmlFor="edit-description">Description</Label>
                          <Textarea
                            id="edit-description"
                            value={selectedItem.description}
                            onChange={(e) => setSelectedItem({ ...selectedItem, description: e.target.value })}
                            rows={3}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="edit-category">Category</Label>
                            <Select
                              value={selectedItem.category.name}
                              onValueChange={(value) => setSelectedItem({ ...selectedItem, category: value })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {categories.map((category) => (
                                  <SelectItem key={category.id} value={category.name}>
                                    {category.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        
                        </div>

                        <div className="flex items-center space-x-2">
                          <Switch
                            id="edit-available"
                            checked={selectedItem.isAvailable}
                            onCheckedChange={(checked) => setSelectedItem({ ...selectedItem, isAvailable: checked })}
                          />
                          <Label htmlFor="edit-available">Available for ordering</Label>
                        </div>

                        <div className="flex justify-end space-x-2 pt-4">
                          <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                            Cancel
                          </Button>
                          <Button onClick={handleEditItem} className="bg-blue-600 hover:bg-blue-700">
                            Save Changes
                          </Button>
                        </div>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDeleteItem(item.id)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

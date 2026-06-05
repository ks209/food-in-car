"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Search, Plus, Edit, Trash2 } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import axios from "axios"

export function CategoryManagement() {
  const [searchTerm, setSearchTerm] = useState("")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [categories, setCategories] = useState([])

  // form state
  const [newCategory, setNewCategory] = useState({
    name: "",
    isActive: true,
    restaurantId: 1, // TODO: replace with actual logged-in restaurant id
  })

  const getColor = (index) => {
    
    const color = [
    "#ef4444", // red
    "#f97316", // orange
    "#eab308", // yellow
    "#10b981", // green
    "#06b6d4", // cyan
    "#3b82f6", // blue
    "#6366f1", // indigo
    "#8b5cf6", // purple
    "#ec4899", // pink
  ]
    return color[index % color.length]
  }

  const fetchCategories = async () => {
    try {
      const response = await axios.get("http://localhost:5000/api/category/", { withCredentials: true })
      setCategories(response.data)
    } catch (error) {
      console.error("Error fetching categories:", error)
    }
  }
  useEffect(() => {
    fetchCategories()
  }, [])

  const handleAddCategory = async () => {
    try {
      const res = await axios.post("http://localhost:5000/api/category/create", newCategory, { withCredentials: true })
      setCategories([...categories, res.data])
      setNewCategory({ name: "", isActive: true})
      setIsAddDialogOpen(false)
    } catch (error) {
      console.error("Error adding category:", error)
    }
  }

  const handleEditCategory = async () => {
    if (!selectedCategory) return
    try {
      const res = await axios.put(
        `http://localhost:5000/api/category/${selectedCategory.id}`,
        selectedCategory,
        { withCredentials: true }
      )
      setIsEditDialogOpen(false)
      setSelectedCategory(null)
      fetchCategories()
    } catch (error) {
      console.error("Error updating category:", error)
    }
  }


  const filteredCategories = categories.filter((cat) =>
    cat.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-700">Category Management</h1>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="h-4 w-4 mr-2" />
              Add Category
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Category</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Category Name</Label>
                <Input
                  id="name"
                  value={newCategory.name}
                  onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                  placeholder="Enter category name"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="active"
                  checked={newCategory.isActive}
                  onCheckedChange={(checked) => setNewCategory({ ...newCategory, isActive: checked })}
                />
                <Label htmlFor="active">Active category</Label>
              </div>
              <div className="flex justify-end space-x-2 pt-4">
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleAddCategory} className="bg-blue-600 hover:bg-blue-700">Add</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search categories..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Categories */}
      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle>Categories ({filteredCategories.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredCategories.map((category) => (
              <div key={category.id} className="border rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: getColor(category.id) }} />
                  <h3 className="font-bold text-gray-900">{category.name}</h3>
                  <p className="text-gray-600 text-sm">
                    {category.menuItems?.length || 0} items
                  </p>
                </div>
                <div className="flex items-center space-x-3">
                  <Badge variant={category.isActive ? "default" : "secondary"}>
                    {category.isActive ? "Active" : "Inactive"}
                  </Badge>
                  <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedCategory(category)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Edit Category</DialogTitle>
                      </DialogHeader>
                      {selectedCategory && (
                        <div className="space-y-4">
                          <div>
                            <Label>Name</Label>
                            <Input
                              value={selectedCategory.name}
                              onChange={(e) => setSelectedCategory({ ...selectedCategory, name: e.target.value })}
                            />
                          </div>
                          <div className="flex items-center space-x-2">
                            <Switch
                              checked={selectedCategory.isActive}
                              onCheckedChange={(checked) =>
                                setSelectedCategory({ ...selectedCategory, isActive: checked })
                              }
                            />
                            <Label>Active category</Label>
                          </div>
                          <div className="flex justify-end space-x-2">
                            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleEditCategory} className="bg-blue-600 hover:bg-blue-700">
                              Save
                            </Button>
                          </div>
                        </div>
                      )}
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

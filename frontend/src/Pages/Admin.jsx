import React, { useEffect, useState } from 'react';
import axios from 'axios';

const Admin = (()=> {
  const [restaurants, setRestaurants] = useState([]);
  const [form, setForm] = useState({
    domain: '',
    username: '',   
    password: '',
    address: '',
    paymentGateway: ''
  });
  const [editingId, setEditingId] = useState(null);

  const fetchRestaurants = async () => {
    try {
      const res = await axios.get(import.meta.env.VITE_SERVER+'/api/restaurant/all');
      console.log(res.data);
      setRestaurants(res.data);
    } catch (err) {
      console.error('API error:', err);
    }
  };

  useEffect(() => {
  fetchRestaurants();
}, []);


  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleCreate = async () => {
    console.log(import.meta.env.VITE_SERVER+'/api/restaurant/create');
    try {
      await axios.post(import.meta.env.VITE_SERVER+'/api/restaurant/create', form);
      setForm({ domain: '', username: '', password: '', address: '', paymentGateway: '' });
      fetchRestaurants();
    } catch (err) {
      console.log(err);
      alert('Error creating restaurant');
    }
  };

  const handleUpdate = async (id) => {
    try {
      await axios.put(`/api/restaurant/update/${id}`, form);
      setForm({ domain: '', username: '', password: '', address: '', paymentGateway: '' });
      setEditingId(null);
      fetchRestaurants();
    } catch (err) {
      alert('Error updating restaurant');
    }
  };

  const handleEdit = (restaurant) => {
    setForm({
      domain: restaurant.domain,
      username: restaurant.username,
      password: '', // do not prefill password
      address: restaurant.address,
      paymentGateway: restaurant.paymentGateway || '',
    });
    setEditingId(restaurant.id);
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm('Are you sure you want to deactivate this restaurant?')) return;
    try {
      await axios.delete(`/api/restaurant/delete/${id}`);
      fetchRestaurants();
    } catch (err) {
      alert('Error deactivating restaurant');
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h2>Restaurants Admin</h2>

      <div style={{ marginBottom: '1rem' }}>
        <input name="domain" placeholder="Domain" value={form.domain} onChange={handleChange} />
        <input name="username" placeholder="Username" value={form.username} onChange={handleChange} />
        <input name="password" placeholder="Password" value={form.password} onChange={handleChange} />
        <input name="address" placeholder="Address" value={form.address} onChange={handleChange} />
        <input name="paymentGateway" placeholder="Payment Gateway" value={form.paymentGateway} onChange={handleChange} />
        {editingId ? (
          <button onClick={() => handleUpdate(editingId)}>Update</button>
        ) : (
          <button onClick={handleCreate}>Create</button>
        )}
      </div>

      <table border="1" cellPadding="8" style={{ width: '100%', textAlign: 'left' }}>
        <thead>
          <tr>
            <th>ID</th>
            <th>Domain</th>
            <th>Username</th>
            <th>Address</th>
            <th>Payment Gateway</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {restaurants.map((rest) => (
            <tr key={rest.id}>
              <td>{rest.id}</td>
              <td>{rest.domain}</td>
              <td>{rest.username}</td>
              <td>{rest.address}</td>
              <td>{rest.paymentGateway || '-'}</td>
              <td>
                <button onClick={() => handleEdit(rest)}>Edit</button>
                <button onClick={() => handleDeactivate(rest.id)}>Deactivate</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

export default Admin;
